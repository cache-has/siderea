/**
 * Black hole renderer for the far (stellar) scene.
 *
 * Renders black holes from the notable object catalog with:
 * - Event horizon: solid black sphere (absorbs all light)
 * - Accretion disk: emissive ring with temperature gradient and animated turbulence
 * - Photon ring / Einstein ring: gravitational lensing effect (supermassive only)
 * - Distance glow: additive sprite visible from afar
 *
 * Visual sizes are hugely exaggerated from physical reality — real Schwarzschild
 * radii are sub-parsec even for supermassive black holes. The visual radius is
 * scaled logarithmically with mass for relative size distinction.
 *
 * Coordinates: far-scene space, 1 unit = 1 parsec (J2000 equatorial).
 *
 * Sources:
 * - Schwarzschild radius: Rs = 2GM/c² ≈ 2.953 × M_solar km
 * - EHT Sgr A* observation (2022): 4.0 ± 0.1 million solar masses
 */

import {
	SphereGeometry,
	RingGeometry,
	Mesh,
	MeshBasicNodeMaterial,
	Sprite,
	SpriteNodeMaterial,
	AdditiveBlending,
	DoubleSide,
	BackSide,
	Group
} from 'three/webgpu';
import {
	vec2,
	vec3,
	float,
	smoothstep,
	normalView,
	uv,
	uniform,
	renderGroup,
	Fn,
	sin,
	mix
} from 'three/tsl';
import type { Scene } from 'three/webgpu';
import type { BlackholeNO, NotableObject } from '$lib/data/types';

export interface BlackholeRendererOptions {
	/**
	 * Base visual radius for supermassive black holes in parsecs.
	 * Hugely exaggerated from physical size for visibility.
	 * @default 10.0
	 */
	supermassiveRadius?: number;

	/**
	 * Base visual radius for stellar black holes in parsecs.
	 * @default 1.0
	 */
	stellarRadius?: number;
}

const DEFAULTS: Required<BlackholeRendererOptions> = {
	supermassiveRadius: 10.0,
	stellarRadius: 1.0
};

interface BlackholeVisual {
	data: BlackholeNO;
	group: Group;
}

/**
 * Schwarzschild radius in km for a given mass in solar masses.
 * Rs = 2GM/c² ≈ 2.953 km per solar mass.
 *
 * Source: derivation from G = 6.674e-11, c = 2.998e8, M_sun = 1.989e30 kg.
 */
export function schwarzschildRadiusKm(massSolar: number): number {
	return 2.953 * massSolar;
}

/**
 * Renders black holes in the far scene with stylized visual effects.
 */
export class BlackholeRenderer {
	private blackholes: BlackholeVisual[] = [];
	private materials: MeshBasicNodeMaterial[] = [];
	private spriteMaterials: SpriteNodeMaterial[] = [];

	// Shared geometries (unit-scale, transformed per instance)
	private ehGeomLarge: SphereGeometry;
	private ehGeomSmall: SphereGeometry;
	private diskGeomLarge: RingGeometry;
	private diskGeomSmall: RingGeometry;
	private lensGeom: SphereGeometry;

	constructor(objects: NotableObject[], options: BlackholeRendererOptions = {}) {
		const opts = { ...DEFAULTS, ...options };
		const bhs = objects.filter((o): o is BlackholeNO => o.type === 'blackhole');

		// Shared unit-scale geometries
		this.ehGeomLarge = new SphereGeometry(1, 32, 16);
		this.ehGeomSmall = new SphereGeometry(1, 16, 8);
		this.diskGeomLarge = new RingGeometry(1.2, 4.0, 64, 1);
		this.diskGeomSmall = new RingGeometry(1.2, 3.0, 32, 1);
		this.lensGeom = new SphereGeometry(1, 32, 16);

		for (const bh of bhs) {
			const isSM = bh.subtype === 'supermassive';
			const baseRadius = isSM ? opts.supermassiveRadius : opts.stellarRadius;

			// Log-scale with mass for relative size distinction
			const massRef = isSM ? 4_000_000 : 10;
			const massScale = Math.max(0.5, Math.log10(bh.mass_solar / massRef) + 1);
			const visualRadius = baseRadius * massScale;

			const group = new Group();
			group.position.set(bh.x, bh.y, bh.z);

			// --- Event horizon: solid black sphere ---
			const ehMat = new MeshBasicNodeMaterial();
			ehMat.colorNode = vec3(0.0, 0.0, 0.02);
			this.materials.push(ehMat);

			const eh = new Mesh(isSM ? this.ehGeomLarge : this.ehGeomSmall, ehMat);
			eh.scale.setScalar(visualRadius);
			group.add(eh);

			// --- Accretion disk: emissive ring ---
			const diskMat = this.createDiskMaterial(isSM);
			this.materials.push(diskMat);

			const disk = new Mesh(isSM ? this.diskGeomLarge : this.diskGeomSmall, diskMat);
			disk.scale.setScalar(visualRadius);
			// Tilt ~75° from face-on (nearly edge-on, visually dramatic)
			disk.rotation.x = Math.PI * 0.42;
			disk.renderOrder = 1;
			group.add(disk);

			// --- Photon ring / lensing sphere (supermassive only) ---
			if (isSM) {
				const lensMat = this.createLensingMaterial();
				this.materials.push(lensMat);

				const lens = new Mesh(this.lensGeom, lensMat);
				lens.scale.setScalar(visualRadius * 2.5);
				lens.renderOrder = 2;
				group.add(lens);
			}

			// --- Glow sprite (visible from distance) ---
			const glowMat = this.createGlowMaterial(isSM);
			this.spriteMaterials.push(glowMat);

			const glow = new Sprite(glowMat);
			glow.scale.setScalar(visualRadius * (isSM ? 8 : 4));
			glow.renderOrder = -1;
			group.add(glow);

			this.blackholes.push({ data: bh, group });
		}
	}

	/** Get the data for all rendered black holes. */
	get items(): BlackholeNO[] {
		return this.blackholes.map((bh) => bh.data);
	}

	/** Get the 3D group for a specific black hole by ID. */
	getGroup(id: string): Group | undefined {
		return this.blackholes.find((bh) => bh.data.id === id)?.group;
	}

	/** Add all black hole groups to a scene. */
	addTo(scene: Scene): void {
		for (const bh of this.blackholes) {
			scene.add(bh.group);
		}
	}

	/** Remove all black hole groups from a scene. */
	removeFrom(scene: Scene): void {
		for (const bh of this.blackholes) {
			scene.remove(bh.group);
		}
	}

	/** Clean up GPU resources. */
	dispose(): void {
		for (const bh of this.blackholes) {
			bh.group.removeFromParent();
		}
		this.ehGeomLarge.dispose();
		this.ehGeomSmall.dispose();
		this.diskGeomLarge.dispose();
		this.diskGeomSmall.dispose();
		this.lensGeom.dispose();
		for (const m of this.materials) m.dispose();
		for (const m of this.spriteMaterials) m.dispose();
		this.blackholes.length = 0;
	}

	/**
	 * Accretion disk material: temperature-gradient ring with animated turbulence.
	 *
	 * Inner regions are hotter (blue-white), outer regions cooler (orange-red).
	 * Additive blending triggers bloom on the emissive output.
	 */
	private createDiskMaterial(isSM: boolean): MeshBasicNodeMaterial {
		const mat = new MeshBasicNodeMaterial({
			side: DoubleSide,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending
		});

		const speed = isSM ? 0.1 : 0.3;
		const timeNode = uniform(0)
			.setGroup(renderGroup)
			.onRenderUpdate((frame: { time: number }) => frame.time * speed);

		mat.colorNode = /* @__PURE__ */ Fn(() => {
			const uvCoord = uv();
			// RingGeometry UV.x: 0 at inner edge → 1 at outer edge
			const r = uvCoord.x;

			// Temperature gradient: blue-white (inner) → orange → deep red (outer)
			const innerColor = vec3(0.8, 0.85, 1.0);
			const midColor = vec3(1.0, 0.7, 0.3);
			const outerColor = vec3(0.8, 0.2, 0.05);

			const c1 = mix(innerColor, midColor, smoothstep(float(0.0), float(0.5), r));
			const color = mix(c1, outerColor, smoothstep(float(0.5), float(1.0), r));

			// Animated turbulence from angular coordinate
			const angle = uvCoord.y.mul(float(Math.PI * 2));
			const turb = sin(angle.mul(8).add(timeNode.mul(2)).add(r.mul(10))).mul(0.15).add(1.0);

			// Brightness falls off radially (hotter/denser inside)
			const brightness = float(1.0).sub(r.mul(0.6)).mul(float(isSM ? 3.0 : 2.0));

			return color.mul(turb).mul(brightness);
		})();

		mat.opacityNode = /* @__PURE__ */ Fn(() => {
			const r = uv().x;
			const inner = smoothstep(float(0.0), float(0.15), r);
			const outer = smoothstep(float(1.0), float(0.7), r);
			return inner.mul(outer).mul(float(isSM ? 0.8 : 0.5));
		})();

		return mat;
	}

	/**
	 * Gravitational lensing material: photon ring / Einstein ring effect.
	 *
	 * Creates a bright additive ring near the silhouette of a sphere, simulating
	 * the concentration of light at the photon sphere (~1.5 × Schwarzschild radius).
	 * Rendered on BackSide so it's visible behind the event horizon sphere.
	 */
	private createLensingMaterial(): MeshBasicNodeMaterial {
		const mat = new MeshBasicNodeMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			side: BackSide
		});

		mat.colorNode = /* @__PURE__ */ Fn(() => {
			// normalView.z: 1.0 at face center → ~0.0 at silhouette edge
			const viewDot = normalView.z.abs();

			// Photon ring: bright band near the silhouette
			const ringCenter = float(0.3);
			const ringWidth = float(0.12);
			const ring = smoothstep(ringCenter.sub(ringWidth), ringCenter, viewDot)
				.mul(smoothstep(ringCenter.add(ringWidth), ringCenter, viewDot));

			// Warm white ring color, boosted for bloom
			const ringColor = vec3(1.0, 0.92, 0.85);

			// Subtle ambient brightening toward silhouette (light concentration)
			const ambient = smoothstep(float(0.6), float(0.0), viewDot).mul(0.08);

			return ringColor.mul(ring.mul(5.0).add(ambient));
		})();

		mat.opacityNode = /* @__PURE__ */ Fn(() => {
			const viewDot = normalView.z.abs();

			const ringCenter = float(0.3);
			const ringWidth = float(0.12);
			const ring = smoothstep(ringCenter.sub(ringWidth), ringCenter, viewDot)
				.mul(smoothstep(ringCenter.add(ringWidth), ringCenter, viewDot));

			const ambient = smoothstep(float(0.6), float(0.0), viewDot).mul(0.04);

			return ring.mul(0.9).add(ambient);
		})();

		return mat;
	}

	/**
	 * Glow sprite material for distant visibility.
	 *
	 * Supermassive: warm orange-white (accretion luminosity).
	 * Stellar: subtle purple-blue (X-ray binary emission).
	 */
	private createGlowMaterial(isSM: boolean): SpriteNodeMaterial {
		const mat = new SpriteNodeMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending
		});

		mat.colorNode = isSM
			? vec3(1.0, 0.75, 0.5)
			: vec3(0.7, 0.5, 0.8);

		const intensity = isSM ? 0.3 : 0.15;
		mat.opacityNode = /* @__PURE__ */ Fn(() => {
			const center = vec2(0.5, 0.5);
			const dist = uv().sub(center).length().mul(2.0);

			const inner = smoothstep(float(1.0), float(0.2), dist).mul(float(intensity));
			const outer = smoothstep(float(1.0), float(0.5), dist).mul(0.05);

			return inner.add(outer);
		})();

		return mat;
	}
}
