/**
 * GPU-instanced star field renderer using Three.js TSL node materials.
 *
 * Renders ~120K stars as screen-aligned sprite quads with:
 * - Size derived from apparent magnitude (brighter = larger)
 * - Color derived from B-V color index via Ballesteros (2012) temperature mapping
 * - Soft circular falloff (not hard squares)
 * - Alpha-modulated brightness attenuation for dim stars
 *
 * Uses Sprite + PointsNodeMaterial with instanced attributes because
 * WebGPU only supports 1px point primitives natively.
 *
 * Coordinates are in parsecs (far-scene space, J2000 equatorial).
 */

import {
	Sprite,
	InstancedBufferAttribute,
	Vector3
} from 'three/webgpu';
import { PointsNodeMaterial } from 'three/webgpu';
import {
	instancedBufferAttribute,
	uv,
	vec2,
	vec3,
	float,
	smoothstep,
	mix,
	uniform,
	Fn,
	sin,
	fract,
	dot
} from 'three/tsl';
import type { Scene } from 'three/webgpu';
import type { StarCatalogData, NotableStar } from '$lib/data/types';
import { bvToRGB, dequantizeBV } from '$lib/data/bv-color';

/** LOD distance thresholds in parsecs. */
export interface StarLODThresholds {
	/** Near band boundary — stars closer than this get glow enhancement (default: 50 pc). */
	near?: number;
	/** Mid band boundary — stars between near and far get baseline rendering (default: 500 pc). */
	far?: number;
}

/** Configuration for star field rendering. */
export interface StarFieldOptions {
	/**
	 * Base point size in pixels at the reference magnitude.
	 * @default 4
	 */
	baseSize?: number;

	/**
	 * Reference magnitude where point size equals baseSize.
	 * Stars brighter than this are larger, dimmer are smaller.
	 * @default 2.0
	 */
	referenceMag?: number;

	/**
	 * Minimum point size in pixels (prevents stars from disappearing).
	 * @default 0.5
	 */
	minSize?: number;

	/**
	 * Maximum point size in pixels (prevents Sirius from being huge).
	 * @default 24
	 */
	maxSize?: number;

	/**
	 * Minimum alpha for the faintest visible stars.
	 * @default 0.15
	 */
	minAlpha?: number;

	/**
	 * Magnitude at which stars reach minimum alpha.
	 * Stars dimmer than this are fully transparent.
	 * @default 12.0
	 */
	fadeMag?: number;

	/** LOD distance thresholds in parsecs. */
	lod?: StarLODThresholds;

	/**
	 * Enable star twinkling/scintillation effect.
	 * Subtle per-star brightness oscillation driven by a pseudo-random phase.
	 * @default true
	 */
	scintillation?: boolean;

	/**
	 * Scintillation intensity — 0 = none, 1 = very noticeable.
	 * @default 0.15
	 */
	scintillationStrength?: number;
}

const LOD_DEFAULTS: Required<StarLODThresholds> = {
	near: 50,
	far: 500
};

const DEFAULTS: Required<Omit<StarFieldOptions, 'lod'>> & { lod: Required<StarLODThresholds> } = {
	baseSize: 2.0,
	referenceMag: 2.0,
	minSize: 0.8,
	maxSize: 8,
	minAlpha: 0.15,
	fadeMag: 12.0,
	lod: LOD_DEFAULTS,
	scintillation: true,
	scintillationStrength: 0.15
};

/**
 * Binary-search a magnitude-sorted array to find how many stars are brighter
 * than (or within the fade zone of) a given magnitude cutoff.
 *
 * The input array must be sorted ascending (brightest/lowest mag first).
 * Returns the index of the first star *beyond* (cutoff + margin), which is
 * the count of instances the GPU should process.
 *
 * @param sortedMags Apparent magnitudes sorted ascending
 * @param cutoff Current magnitude cutoff
 * @param margin Extra magnitude beyond cutoff to include (covers shader fade zone). Default 1.0.
 * @returns Number of stars to render (index into sorted buffer)
 */
export function magCutoffToVisibleCount(
	sortedMags: Float32Array,
	cutoff: number,
	margin = 1.0
): number {
	const target = cutoff + margin;
	let lo = 0;
	let hi = sortedMags.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (sortedMags[mid] <= target) lo = mid + 1;
		else hi = mid;
	}
	// Always render at least a minimum count to avoid edge cases
	return Math.max(lo, Math.min(100, sortedMags.length));
}

/**
 * Compute point size from apparent magnitude.
 *
 * Uses the standard astronomical flux relation: flux ∝ 10^(-mag/2.5).
 * Size is proportional to sqrt(flux) for perceptual brightness scaling,
 * clamped to [minSize, maxSize].
 *
 * @returns Size in pixels
 */
export function magnitudeToSize(
	mag: number,
	baseSize: number,
	referenceMag: number,
	minSize: number,
	maxSize: number
): number {
	// Relative flux compared to reference magnitude
	const relativeFlux = Math.pow(10, (referenceMag - mag) / 2.5);
	// Size proportional to sqrt(flux) for perceptual scaling
	const size = baseSize * Math.sqrt(relativeFlux);
	return Math.max(minSize, Math.min(maxSize, size));
}

/**
 * Compute alpha (brightness attenuation) from apparent magnitude.
 *
 * Bright stars (mag < referenceMag) get alpha=1.
 * Dim stars fade linearly from 1 to minAlpha between referenceMag and fadeMag.
 */
export function magnitudeToAlpha(
	mag: number,
	referenceMag: number,
	minAlpha: number,
	fadeMag: number
): number {
	if (mag <= referenceMag) return 1.0;
	if (mag >= fadeMag) return minAlpha;
	// Linear fade between reference and fade magnitude
	const t = (mag - referenceMag) / (fadeMag - referenceMag);
	return 1.0 - t * (1.0 - minAlpha);
}

/**
 * Compute a dynamic apparent magnitude cutoff from the camera's distance
 * to the origin (in parsecs).
 *
 * When zoomed in close (near Sol), we can afford to render dimmer stars
 * (higher mag cutoff). When zoomed far out, we cull dim stars to reduce
 * visual clutter and improve the galaxy-scale view.
 *
 * Mapping:
 *   camera ≤ 1 pc   → mag cutoff 12 (show everything)
 *   camera ~ 100 pc → mag cutoff ~8
 *   camera ~ 1000 pc → mag cutoff ~5
 *   camera ≥ 10000 pc → mag cutoff 2 (only bright stars)
 */
export function cameraDistanceToMagCutoff(distancePc: number): number {
	if (distancePc <= 1) return 12.0;
	if (distancePc >= 10000) return 2.0;
	// Log-linear interpolation: cutoff decreases as distance increases
	const t = Math.log10(distancePc) / 4.0; // 0 at 1pc, 1 at 10000pc
	return 12.0 - t * 10.0; // 12 → 2
}

/**
 * Pre-compute all instanced attributes from star catalog data.
 *
 * Returns typed arrays ready for GPU upload:
 * - colors: Float32Array[count * 3] — linear RGB from B-V
 * - sizes: Float32Array[count] — pixel sizes from apparent magnitude
 * - alphas: Float32Array[count] — brightness attenuation from apparent magnitude
 */
/** The magnitude-related options needed by computeStarAttributes. */
type MagnitudeOptions = Pick<Required<StarFieldOptions>, 'baseSize' | 'referenceMag' | 'minSize' | 'maxSize' | 'minAlpha' | 'fadeMag'>;

export function computeStarAttributes(
	data: StarCatalogData,
	options: MagnitudeOptions
): { colors: Float32Array; sizes: Float32Array; alphas: Float32Array } {
	const { count, apparentMag, colorIndex } = data;
	const colors = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const alphas = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		// B-V → RGB
		const bv = dequantizeBV(colorIndex[i]);
		const [r, g, b] = bvToRGB(bv);
		colors[i * 3] = r;
		colors[i * 3 + 1] = g;
		colors[i * 3 + 2] = b;

		// Magnitude → size and alpha
		const mag = apparentMag[i];
		sizes[i] = magnitudeToSize(mag, options.baseSize, options.referenceMag, options.minSize, options.maxSize);
		alphas[i] = magnitudeToAlpha(mag, options.referenceMag, options.minAlpha, options.fadeMag);
	}

	return { colors, sizes, alphas };
}

/**
 * GPU-instanced star field renderer with distance-based LOD.
 *
 * Creates a single Sprite object with PointsNodeMaterial that renders
 * all catalog stars as instanced screen-aligned quads.
 *
 * LOD bands (computed per-star on GPU via camera position uniform):
 * - Near (<50 pc from camera): 2× size boost, enhanced glow halo
 * - Mid (50–500 pc): baseline rendering
 * - Far (>500 pc): 0.5× size, reduced alpha
 */
export class StarFieldRenderer {
	readonly sprite: Sprite;
	readonly material: PointsNodeMaterial;
	readonly starCount: number;

	/** Camera position uniform in parsecs — update each frame via updateCameraPosition(). */
	private cameraPosUniform: ReturnType<typeof uniform>;

	/** Dynamic magnitude cutoff — stars dimmer than this are hidden. */
	private magCutoffUniform: ReturnType<typeof uniform>;

	/** Elapsed time in seconds — drives scintillation animation. */
	private timeUniform: ReturnType<typeof uniform>;

	/**
	 * Warp streak intensity: 0 = normal circular sprites, 1 = fully elongated streaks.
	 * Set per-frame by the warp controller.
	 */
	private warpIntensityUniform: ReturnType<typeof uniform>;

	/** Warp streak direction X component in normalized screen space. */
	private warpDirXUniform: ReturnType<typeof uniform>;
	/** Warp streak direction Y component in normalized screen space. */
	private warpDirYUniform: ReturnType<typeof uniform>;

	/** Scintillation strength uniform — 0 disables twinkling, >0 enables it. */
	private scintStrengthUniform: ReturnType<typeof uniform>;

	/** Global brightness multiplier for dark adaptation (1.0 = normal). */
	private globalBrightnessUniform: ReturnType<typeof uniform>;

	/** Magnitude-sorted apparent magnitudes for dynamic instance count binary search. */
	private sortedMags: Float32Array;

	constructor(data: StarCatalogData, options: StarFieldOptions = {}, notableStars?: NotableStar[]) {
		const lod = { ...LOD_DEFAULTS, ...options.lod };
		const opts = { ...DEFAULTS, ...options, lod };
		this.starCount = data.count;

		// Camera position uniform (parsec space, updated per frame)
		this.cameraPosUniform = uniform(new Vector3(0, 0, 0));
		const camPos = this.cameraPosUniform;

		// Dynamic magnitude cutoff uniform (default: show all)
		this.magCutoffUniform = uniform(12.0);
		const magCutoff = this.magCutoffUniform;

		// Time uniform for scintillation
		this.timeUniform = uniform(0.0);
		const time = this.timeUniform;

		// Warp streak uniforms
		this.warpIntensityUniform = uniform(0.0);
		const warpIntensity = this.warpIntensityUniform;
		this.warpDirXUniform = uniform(0.0);
		this.warpDirYUniform = uniform(1.0);
		const warpDirX = this.warpDirXUniform;
		const warpDirY = this.warpDirYUniform;

		// Scintillation config — strength is a uniform so it can be adjusted at runtime.
		// Setting strength to 0 effectively disables twinkling without rebuilding the shader.
		this.scintStrengthUniform = uniform(opts.scintillation ? opts.scintillationStrength : 0);
		const scintStrength = this.scintStrengthUniform;

		// Global brightness for dark adaptation — dims stars when near bright objects,
		// boosts when in deep space. Updated per frame via setGlobalBrightness().
		this.globalBrightnessUniform = uniform(1.0);
		const globalBrightness = this.globalBrightnessUniform;

		// LOD threshold uniforms
		const lodNear = float(lod.near);
		const lodFar = float(lod.far);

		// Pre-compute per-star attributes on CPU
		const { colors, sizes, alphas } = computeStarAttributes(data, opts);

		// Apply size boost for notable stars (1.3x larger for visual distinction)
		if (notableStars) {
			const NOTABLE_SIZE_BOOST = 1.3;
			for (const star of notableStars) {
				if (star.index >= 0 && star.index < data.count) {
					sizes[star.index] = Math.min(sizes[star.index] * NOTABLE_SIZE_BOOST, opts.maxSize);
				}
			}
		}

		// Sort all instance data by apparent magnitude (brightest first).
		// This enables dynamic instance count reduction: when the camera is far out,
		// we set sprite.count to only the N brightest stars, skipping vertex shader
		// work for stars that would be fully magnitude-culled anyway.
		const sortOrder = Array.from({ length: data.count }, (_, i) => i);
		sortOrder.sort((a, b) => data.apparentMag[a] - data.apparentMag[b]);

		const sortedPositions = new Float32Array(data.count * 3);
		const sortedColors = new Float32Array(data.count * 3);
		const sortedSizes = new Float32Array(data.count);
		const sortedAlphas = new Float32Array(data.count);
		const sortedMags = new Float32Array(data.count);

		for (let i = 0; i < data.count; i++) {
			const src = sortOrder[i];
			sortedPositions[i * 3] = data.positions[src * 3];
			sortedPositions[i * 3 + 1] = data.positions[src * 3 + 1];
			sortedPositions[i * 3 + 2] = data.positions[src * 3 + 2];
			sortedColors[i * 3] = colors[src * 3];
			sortedColors[i * 3 + 1] = colors[src * 3 + 1];
			sortedColors[i * 3 + 2] = colors[src * 3 + 2];
			sortedSizes[i] = sizes[src];
			sortedAlphas[i] = alphas[src];
			sortedMags[i] = data.apparentMag[src];
		}

		this.sortedMags = sortedMags;

		// Create instanced buffer attributes (from magnitude-sorted data)
		const positionAttr = new InstancedBufferAttribute(sortedPositions, 3);
		const colorAttr = new InstancedBufferAttribute(sortedColors, 3);
		const sizeAttr = new InstancedBufferAttribute(sortedSizes, 1);
		const alphaAttr = new InstancedBufferAttribute(sortedAlphas, 1);
		const magAttr = new InstancedBufferAttribute(sortedMags, 1);

		// TSL node references for instanced data
		const instancePosition = vec3(instancedBufferAttribute(positionAttr));
		const instanceColor = vec3(instancedBufferAttribute(colorAttr));
		const instanceSize = float(instancedBufferAttribute(sizeAttr));
		const instanceAlpha = float(instancedBufferAttribute(alphaAttr));
		const instanceMag = float(instancedBufferAttribute(magAttr));

		// Compute per-star distance from camera (used by both size and opacity)
		// This is evaluated per-vertex in the shader.
		const starDist = instancePosition.sub(camPos).length();

		// --- Dynamic magnitude cutoff ---
		// Stars dimmer than the cutoff fade out smoothly over a 0.5-mag range
		// to avoid hard pop-in/pop-out. cutoffAlpha is 1.0 for bright stars,
		// 0.0 for stars beyond (cutoff + 0.5).
		const cutoffAlpha = smoothstep(magCutoff.add(0.5), magCutoff.sub(0.5), instanceMag);

		// LOD size multiplier:
		//   near (<lodNear): lerp from 2.0 → 1.0
		//   mid  (lodNear..lodFar): 1.0
		//   far  (>lodFar): lerp from 1.0 → 0.5
		const nearFactor = smoothstep(float(0.0), lodNear, starDist); // 0 at camera, 1 at lodNear
		const farFactor = smoothstep(lodFar, lodFar.mul(2.0), starDist); // 0 at lodFar, 1 at 2×lodFar
		const sizeMult = mix(float(2.0), float(1.0), nearFactor).mul(
			mix(float(1.0), float(0.5), farFactor)
		);

		// LOD alpha multiplier for far stars: fade alpha for very distant stars
		const alphaMult = mix(float(1.0), float(0.6), farFactor);

		// --- Scintillation (twinkling) ---
		// Pseudo-random phase per star derived from position hash.
		// Uses a simple dot-product hash to give each star a unique oscillation.
		// Multiple sine waves at different frequencies create organic variation.
		// Scintillation is always compiled into the shader. When scintStrength=0
		// the multiply is effectively 1.0, so there's no visual cost.
		const phase = fract(
			dot(instancePosition, vec3(12.9898, 78.233, 45.164)).mul(43758.5453)
		);
		const wave1 = sin(time.mul(1.7).add(phase.mul(6.2832)));
		const wave2 = sin(time.mul(2.3).add(phase.mul(12.5664)));
		const scintMult = float(1.0).add(
			wave1.mul(0.6).add(wave2.mul(0.4)).mul(scintStrength)
		);

		// Build the material. alphaTest discards low-opacity fragments at
		// sprite edges and for dim stars, preventing 120K sprites from
		// accumulating into a solid background color in the render target.
		this.material = new PointsNodeMaterial({
			sizeAttenuation: false,
			depthWrite: false,
			transparent: true,
			alphaTest: 0.05
		});

		this.material.positionNode = instancePosition;
		// Zero out size for culled stars (magnitude cutoff) so they generate no fragments.
		// During warp, boost size to accommodate streak elongation (up to 4× at full intensity).
		const warpSizeBoost = mix(float(1.0), float(4.0), warpIntensity);
		this.material.sizeNode = instanceSize.mul(sizeMult).mul(cutoffAlpha).mul(warpSizeBoost);

		// Color from B-V index (instanced per-star)
		this.material.colorNode = instanceColor;

		// Fragment shader: soft circular falloff with LOD-dependent glow.
		// During warp, reshapes from circle to elongated streak along warpDir.
		this.material.opacityNode = /* @__PURE__ */ Fn(() => {
			// UV goes 0→1 across the sprite quad; center is (0.5, 0.5)
			const center = vec2(0.5);
			const offset = uv().sub(center).mul(2.0); // -1 to +1

			// --- Warp streak UV transformation ---
			// Project the UV offset onto the warp direction and its perpendicular.
			// Compress the perpendicular axis to create an elongated shape.
			// Component along warp direction (dot product with dir)
			const along = offset.x.mul(warpDirX).add(offset.y.mul(warpDirY));
			// Component perpendicular to warp direction (cross-product analog)
			const perp = offset.x.mul(warpDirY.negate()).add(offset.y.mul(warpDirX));

			// During warp, shrink the perpendicular component (makes thin streaks)
			// and keep the along component (long streaks).
			// perpScale: 1.0 (normal circle) → 0.15 (thin line) as warpIntensity goes 0→1
			const perpScale = mix(float(1.0), float(0.15), warpIntensity);
			// Effective distance: elliptical when warping, circular when not
			const perpScaled = perp.div(perpScale);
			const warpedDistSq = along.mul(along).add(perpScaled.mul(perpScaled));
			// pow(x, 0.5) = sqrt — using pow because TSL node chains don't always have .sqrt()
			const warpedDist = warpedDistSq.pow(0.5);
			const normalDist = offset.length();
			const dist = mix(normalDist, warpedDist, warpIntensity);

			// Core circle/streak mask
			const circleMask = smoothstep(1.0, 0.6, dist);

			// Glow halo — wider, faint ring for nearby stars
			// glowStrength is 1 at camera, 0 at lodNear
			const glowStrength = smoothstep(lodNear, float(0.0), starDist);
			const glowMask = smoothstep(1.0, 0.3, dist).mul(0.3).mul(glowStrength);

			// Combine: core + glow, modulated by per-star brightness, LOD alpha,
			// magnitude cutoff, and scintillation.
			// During warp, boost brightness (stars appear more vivid as you rush past).
			const warpBrightness = mix(float(1.0), float(1.5), warpIntensity);
			const combined = circleMask.add(glowMask);
			return combined.mul(instanceAlpha).mul(alphaMult).mul(cutoffAlpha).mul(scintMult).mul(warpBrightness).mul(globalBrightness);
		})();

		// Create the sprite (single instance, GPU-instanced via attributes)
		this.sprite = new Sprite(this.material);
		this.sprite.count = data.count;
		this.sprite.frustumCulled = false; // stars surround the camera; don't cull
	}

	/**
	 * Update the camera position for LOD calculations.
	 * Call each frame with the far-scene camera position (in parsecs).
	 */
	updateCameraPosition(x: number, y: number, z: number): void {
		(this.cameraPosUniform.value as Vector3).set(x, y, z);
	}

	/**
	 * Update the dynamic apparent magnitude cutoff.
	 * Stars dimmer than this value (higher magnitude) are faded out.
	 * Also reduces the GPU instance count so the vertex shader skips
	 * stars that would be fully culled.
	 * Use cameraDistanceToMagCutoff() to compute from camera distance.
	 */
	updateMagnitudeCutoff(mag: number): void {
		this.magCutoffUniform.value = mag;
		this.sprite.count = magCutoffToVisibleCount(this.sortedMags, mag);
	}

	/**
	 * Update elapsed time for scintillation animation.
	 * Call each frame with the elapsed time in seconds.
	 */
	updateTime(elapsed: number): void {
		this.timeUniform.value = elapsed;
	}

	/**
	 * Update warp streak effect parameters.
	 * @param intensity 0 = normal, 1 = full streak effect.
	 * @param dirX Normalized screen-space streak direction X component.
	 * @param dirY Normalized screen-space streak direction Y component.
	 */
	updateWarpStreak(intensity: number, dirX = 0, dirY = 1): void {
		this.warpIntensityUniform.value = intensity;
		if (intensity > 0) {
			this.warpDirXUniform.value = dirX;
			this.warpDirYUniform.value = dirY;
		}
	}

	/** Set scintillation (twinkling) strength. 0 = off, 0.15 = default, up to ~0.5. */
	setScintillationStrength(strength: number): void {
		this.scintStrengthUniform.value = Math.max(0, Math.min(0.5, strength));
	}

	/** Get current scintillation strength. */
	getScintillationStrength(): number {
		return this.scintStrengthUniform.value;
	}

	/** Set global brightness multiplier for dark adaptation. 0 = invisible, 1 = normal, >1 = enhanced. */
	setGlobalBrightness(v: number): void {
		this.globalBrightnessUniform.value = Math.max(0, v);
	}

	/** Add the star field to a scene (typically the far scene). */
	addTo(scene: Scene): void {
		scene.add(this.sprite);
	}

	/** Remove from scene and dispose GPU resources. */
	dispose(): void {
		this.sprite.removeFromParent();
		this.material.dispose();
	}
}
