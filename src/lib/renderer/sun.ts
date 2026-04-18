/**
 * Sun renderer for the near (solar system) scene.
 *
 * Renders the Sun at the heliocentric origin with:
 * - Procedural animated surface (granulation-like turbulence, limb darkening)
 * - Corona glow billboard (additive-blended sprite)
 * - Sized for visibility with documented physical radius
 *
 * Works with the existing SolarSystemLighting (PointLight at origin) and
 * post-processing bloom to create a convincing stellar appearance.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Source: IAU 2015 nominal solar radius R_sun = 695,700 km.
 */

import {
	SphereGeometry,
	Mesh,
	Sprite,
	SpriteNodeMaterial,
	MeshBasicNodeMaterial,
	AdditiveBlending,
	FrontSide
} from 'three/webgpu';
import {
	uv,
	vec2,
	vec3,
	float,
	sin,
	smoothstep,
	mix,
	normalView,
	uniform,
	renderGroup,
	positionLocal,
	Fn
} from 'three/tsl';
import type { Scene } from 'three/webgpu';

export interface SunRendererOptions {
	/**
	 * Visual radius in AU (exaggerated for visibility at solar-system scale).
	 * Real radius: ~0.00465 AU.
	 * @default 0.02
	 */
	visualRadius?: number;

	/**
	 * Corona glow sprite half-extent in AU.
	 * @default 0.15
	 */
	coronaRadius?: number;

	/**
	 * Surface animation speed multiplier.
	 * @default 1
	 */
	animationSpeed?: number;
}

/**
 * Physical radius of the Sun in AU.
 * Source: IAU 2015 nominal solar radius = 695,700 km.
 * 695700 / 149597870.7 ≈ 0.004650 AU.
 */
export const SUN_RADIUS_AU = 695_700 / 149_597_870.7;

const DEFAULTS: Required<SunRendererOptions> = {
	visualRadius: 0.02,
	coronaRadius: 0.15,
	animationSpeed: 1
};

/**
 * Renders the Sun as a procedurally-shaded sphere with corona glow.
 *
 * The sphere uses a TSL node material with animated sine-based turbulence
 * for a stylized granulation effect, plus limb darkening from the
 * view-space normal. Output color values exceed 1.0 to trigger the
 * post-processing bloom pass.
 *
 * The corona is an additive-blended sprite billboard with a layered
 * radial falloff, providing a soft glow visible from a distance.
 */
export class SunRenderer {
	readonly mesh: Mesh;
	readonly corona: Sprite;
	readonly surfaceMaterial: MeshBasicNodeMaterial;
	readonly coronaMaterial: SpriteNodeMaterial;

	private geometry: SphereGeometry;

	constructor(options: SunRendererOptions = {}) {
		const opts = { ...DEFAULTS, ...options };

		// --- Sun sphere with procedural surface ---
		this.geometry = new SphereGeometry(opts.visualRadius, 64, 32);

		this.surfaceMaterial = new MeshBasicNodeMaterial({
			side: FrontSide
		});

		const speed = opts.animationSpeed;

		// Elapsed-time uniform updated each frame (same pattern as Three.js Timer.js).
		// Multiplied by speed for animation rate control.
		const timeNode = uniform(0)
			.setGroup(renderGroup)
			.onRenderUpdate((frame: { time: number }) => frame.time * speed);

		this.surfaceMaterial.colorNode = /* @__PURE__ */ Fn(() => {
			const t = timeNode;
			const p = positionLocal.xyz;

			// Limb darkening: view-space normal z = cos(angle to camera).
			// 1.0 at face center, 0.0 at silhouette edge.
			const viewDot = normalView.z.clamp(0.0, 1.0);
			const limb = smoothstep(float(0.0), float(0.7), viewDot);

			// Pseudo-turbulence: overlapping sine waves at different
			// frequencies and speeds simulate granulation patterns.
			const n1 = sin(p.x.mul(40).add(p.y.mul(30)).add(t.mul(0.3)));
			const n2 = sin(p.y.mul(50).sub(p.z.mul(35)).sub(t.mul(0.2)));
			const n3 = sin(p.z.mul(45).add(p.x.mul(25)).add(t.mul(0.15)));

			const granulation = n1.mul(n2).add(n3.mul(0.5)).mul(0.06).add(1.0);

			// Color ramp: near-white at center → warm orange at limb
			const centerColor = vec3(1.0, 0.97, 0.85);
			const edgeColor = vec3(1.0, 0.55, 0.1);
			const baseColor = mix(edgeColor, centerColor, limb);

			// Multiply by granulation and boost above 1.0 for bloom trigger
			return baseColor.mul(granulation).mul(float(3.0));
		})();

		this.mesh = new Mesh(this.geometry, this.surfaceMaterial);
		this.mesh.position.set(0, 0, 0);

		// --- Corona glow sprite (additive-blended billboard) ---
		this.coronaMaterial = new SpriteNodeMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending
		});

		this.coronaMaterial.colorNode = vec3(1.0, 0.85, 0.6);

		this.coronaMaterial.opacityNode = /* @__PURE__ */ Fn(() => {
			const center = vec2(0.5);
			const dist = uv().sub(center).length().mul(2.0); // 0 at center, 1 at edge

			// Layered radial falloff for natural corona appearance
			const inner = smoothstep(1.0, 0.15, dist).mul(0.7);
			const outer = smoothstep(1.0, 0.6, dist).mul(0.15);

			return inner.add(outer);
		})();

		this.corona = new Sprite(this.coronaMaterial);
		this.corona.scale.setScalar(opts.coronaRadius * 2);
		this.corona.position.set(0, 0, 0);
	}

	/** Add the Sun to a scene (typically the near scene). */
	addTo(scene: Scene): void {
		scene.add(this.mesh);
		scene.add(this.corona);
	}

	/** Remove the Sun from a scene. */
	removeFrom(scene: Scene): void {
		scene.remove(this.mesh);
		scene.remove(this.corona);
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		this.mesh.removeFromParent();
		this.corona.removeFromParent();
		this.geometry.dispose();
		this.surfaceMaterial.dispose();
		this.coronaMaterial.dispose();
	}
}
