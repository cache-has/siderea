/**
 * Post-processing pipeline using Three.js TSL node system.
 *
 * Multi-scene compositing via depth-based layering:
 * - Far scene (stars on black) is the base layer
 * - Near scene (solar system objects) overlays where geometry is present
 * - Depth buffer determines near-scene coverage
 *
 * Selective bloom via per-layer emissive extraction:
 * - Far scene: all stars are self-luminous → entire output treated as emissive
 * - Near scene: only pixels exceeding emissiveThreshold (e.g. Sun at 3.0×)
 *   contribute to bloom; lit planet surfaces are filtered out
 * - Single bloom pass on the emissive composite, added to the base scene
 *
 * Uses explicit renderOutput() for tone mapping + sRGB, with
 * outputColorTransform=false to prevent double tone mapping from
 * RenderPipeline's automatic context propagation to pass nodes.
 */

import { RenderPipeline, ACESFilmicToneMapping, SRGBColorSpace, Vector2 } from 'three/webgpu';
import { pass, mix, step, float, smoothstep, luminance, renderOutput, uniform, Fn, vec2, vec4, convertToTexture, uv } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { WebGPURenderer } from 'three/webgpu';
import type BloomNode from 'three/addons/tsl/display/BloomNode.js';
import type { SceneLayerManager } from './scene-layers';

export interface PostProcessingOptions {
	/** Bloom glow strength multiplier. @default 0.5 */
	bloomStrength?: number;

	/** Bloom glow radius [0, 1]. @default 0.4 */
	bloomRadius?: number;

	/**
	 * Luminance threshold for bloom's high-pass filter.
	 * Applied to the emissive composite — controls which emissive pixels
	 * are bright enough to produce visible glow. Lower values let dimmer
	 * stars bloom; higher values restrict glow to the brightest sources.
	 * @default 0.4
	 */
	bloomThreshold?: number;

	/**
	 * Luminance threshold for near-scene emissive extraction.
	 * Only near-scene pixels with luminance above this value contribute to
	 * bloom. The Sun outputs ~3.0× so it passes easily; lit planet surfaces
	 * (typically ≤1.0) are filtered out. Set higher to restrict bloom to
	 * only the most extreme emitters.
	 * @default 1.5
	 */
	emissiveThreshold?: number;
}

const DEFAULTS: Required<PostProcessingOptions> = {
	bloomStrength: 0.5,
	bloomRadius: 0.4,
	bloomThreshold: 0.4,
	emissiveThreshold: 1.5
};

export class PostProcessingPipeline {
	readonly pipeline: RenderPipeline;
	private bloomNode: BloomNode;

	// Warp effect uniforms — driven by WarpEffects per frame
	private chromaticAberrationUniform: ReturnType<typeof uniform>;
	private barrelDistortionUniform: ReturnType<typeof uniform>;

	constructor(
		renderer: WebGPURenderer,
		layers: SceneLayerManager,
		options: PostProcessingOptions = {}
	) {
		const opts = { ...DEFAULTS, ...options };

		// Pass nodes — each renders its scene to an internal RGBA render target.
		const farPass = pass(layers.far.scene, layers.far.camera);
		const nearPass = pass(layers.near.scene, layers.near.camera);

		const farColor = farPass.getTextureNode('output');
		const nearColor = nearPass.getTextureNode('output');

		// Depth-based compositing: near scene overlays far scene where geometry exists.
		const nearDepth = nearPass.getLinearDepthNode();
		const isEmptyNear = step(float(0.99), nearDepth);
		const composite = mix(nearColor, farColor, isEmptyNear);

		// Selective bloom: stars are emissive; near scene only blooms for
		// super-bright pixels (Sun corona at ~3.0×).
		const emThreshold = float(opts.emissiveThreshold);
		const nearLum = luminance(nearColor.rgb);
		const nearEmissiveMask = smoothstep(emThreshold, emThreshold.add(0.2), nearLum);
		const nearEmissive = nearColor.mul(nearEmissiveMask);
		const emissiveComposite = mix(nearEmissive, farColor, isEmptyNear);

		this.bloomNode = bloom(
			emissiveComposite,
			opts.bloomStrength,
			opts.bloomRadius,
			opts.bloomThreshold
		);

		const compositeWithBloom = composite.add(this.bloomNode);

		// Warp distortion uniforms (barrel distortion + chromatic aberration)
		this.barrelDistortionUniform = uniform(0);
		this.chromaticAberrationUniform = uniform(0);
		const barrelAmount = this.barrelDistortionUniform;
		const chromaticAmount = this.chromaticAberrationUniform;
		const center = vec2(0.5, 0.5);

		const compositeTexture = convertToTexture(compositeWithBloom);

		const applyWarpDistortion = Fn(() => {
			const uvCoord = uv();
			const offset = uvCoord.sub(center);
			const dist = offset.length();

			const barrelFactor = float(1.0).add(barrelAmount.mul(dist.mul(dist)));
			const barrelUV = center.add(offset.mul(barrelFactor));

			const barrelOffset = barrelUV.sub(center);
			const caStrength = chromaticAmount.mul(dist);
			const rOffset = barrelOffset.mul(float(1.0).add(caStrength.mul(0.02)));
			const gOffset = barrelOffset;
			const bOffset = barrelOffset.mul(float(1.0).sub(caStrength.mul(0.02)));

			return vec4(
				compositeTexture.sample(center.add(rOffset)).r,
				compositeTexture.sample(center.add(gOffset)).g,
				compositeTexture.sample(center.add(bOffset)).b,
				float(1.0)
			);
		});

		// Let RenderPipeline handle tone mapping + sRGB
		this.pipeline = new RenderPipeline(renderer, applyWarpDistortion());
		this.pipeline.outputColorTransform = true;
	}

	render(): void {
		this.pipeline.render();
	}

	setSize(_w: number, _h: number): void {
		// PassNode handles its own render target sizing
	}

	get bloomStrength(): number {
		return this.bloomNode.strength.value;
	}
	set bloomStrength(v: number) {
		this.bloomNode.strength.value = v;
	}

	get bloomRadius(): number {
		return this.bloomNode.radius.value;
	}
	set bloomRadius(v: number) {
		this.bloomNode.radius.value = v;
	}

	get bloomThreshold(): number {
		return this.bloomNode.threshold.value;
	}
	set bloomThreshold(v: number) {
		this.bloomNode.threshold.value = v;
	}

	/** Chromatic aberration strength (0 = off, ~2–5 = visible during warp). */
	get chromaticAberration(): number {
		return this.chromaticAberrationUniform.value as number;
	}
	set chromaticAberration(v: number) {
		this.chromaticAberrationUniform.value = v;
	}

	/** Barrel distortion strength (0 = off, ~0.5–2 = visible tunnel effect). */
	get barrelDistortion(): number {
		return this.barrelDistortionUniform.value as number;
	}
	set barrelDistortion(v: number) {
		this.barrelDistortionUniform.value = v;
	}

	dispose(): void {
		this.pipeline.dispose();
	}
}
