/**
 * Ring system renderer for planets with ring systems.
 *
 * Renders planetary rings as flat annulus geometry with procedural
 * transparency shaders. Supports:
 * - Saturn: prominent rings with Cassini Division gap
 * - Uranus: narrow, dark ring system
 * - Neptune: faint rings
 *
 * Rings are created as children of their parent planet mesh so they
 * inherit position and axial tilt automatically.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Ring radii sourced from solar-system.json (km), converted to AU with exaggeration.
 *
 * Sources:
 * - Saturn ring structure: NASA/JPL Cassini mission data
 * - Cassini Division: 4,800 km gap at ~117,580-122,170 km
 * - Uranus rings: Voyager 2 observations
 * - Neptune rings: Voyager 2 observations
 */

import {
	RingGeometry,
	Mesh,
	MeshStandardNodeMaterial,
	MeshStandardMaterial,
	DoubleSide,
	Group
} from 'three/webgpu';
import type { Texture } from 'three/webgpu';
import {
	uv,
	vec3,
	float,
	smoothstep,
	uniform,
	positionLocal,
	Fn
} from 'three/tsl';
import { Vector3, Quaternion } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import type { RingSystem, SolarSystemBody } from '$lib/data/types';

/** Conversion factor: km to AU. */
const KM_PER_AU = METERS_PER_AU / 1000;

/** NAIF IDs for ringed bodies. */
const SATURN = 6;
const URANUS = 7;
const NEPTUNE = 8;
const HAUMEA = 12;

export interface RingRendererOptions {
	/**
	 * Size exaggeration factor (must match planet renderer).
	 * @default 200
	 */
	sizeExaggeration?: number;

	/**
	 * Number of radial segments for ring geometry.
	 * @default 64
	 */
	radialSegments?: number;

	/**
	 * Number of tubular (around-the-ring) segments.
	 * @default 128
	 */
	tubularSegments?: number;
}

const DEFAULTS: Required<RingRendererOptions> = {
	sizeExaggeration: 200,
	radialSegments: 64,
	tubularSegments: 128
};

/** Runtime state for a single ring system. */
interface RingState {
	naifId: number;
	mesh: Mesh;
	geometry: RingGeometry;
	material: MeshStandardNodeMaterial;
	/** Group containing the ring, attached to planet mesh. */
	group: Group;
	/** Inner radius in km (from data). */
	innerKm: number;
	/** Outer radius in km (from data). */
	outerKm: number;
	/** Planet radius in km (for shadow computation). */
	planetRadiusKm: number;
	/** Uniform: sun direction in ring-local space (normalized). Updated per frame. */
	sunDirUniform: { value: Vector3 };
	/** Uniform: planet radius in AU (with exaggeration). */
	planetRadiusUniform: { value: number };
}

/**
 * Compute a planet-shadow darkening factor for ring fragments.
 *
 * The planet casts a cylindrical shadow through the ring plane.
 * In ring-local space, the shadow is the region where:
 * 1. The fragment is on the anti-sunward side of the planet
 * 2. The perpendicular distance from the sun-planet axis is < planet radius
 *
 * Returns a TSL node: 1.0 = fully lit, ~0.15 = in planet shadow.
 */
function planetShadowFactor(
	sunDirUniform: { value: Vector3 },
	planetRadiusUniform: { value: number }
) {
	return Fn(() => {
		const pos = positionLocal;
		// Pass .value directly: Vector3 is mutated in-place so reference stays reactive
		const sunDir = uniform(sunDirUniform.value);
		const planetR = uniform(planetRadiusUniform.value);

		// Project fragment position onto sun direction
		// Negative = behind planet (in shadow side)
		const projAlongSun = pos.dot(sunDir);

		// Perpendicular distance from the sun-planet axis
		const projVec = sunDir.mul(projAlongSun);
		const perpVec = pos.sub(projVec);
		const perpDist = perpVec.length();

		// Shadow: fragment is behind planet AND within planet's cylindrical shadow
		// Use smoothstep for soft shadow edges
		const behindPlanet = smoothstep(float(0.0), float(-0.001), projAlongSun);
		const withinCylinder = smoothstep(planetR.mul(1.05), planetR.mul(0.95), perpDist);

		// Combine: shadow = 0.15 (darkened), lit = 1.0
		const shadow = float(1.0).sub(behindPlanet.mul(withinCylinder).mul(0.85));
		return shadow;
	})();
}

/**
 * Create a procedural ring material for Saturn.
 *
 * Features:
 * - Multiple concentric ring bands with varying brightness
 * - Cassini Division (dark gap at ~70% of ring width)
 * - Semi-transparent throughout
 * - Planet shadow darkening
 */
function saturnRingMaterial(
	sunDirUniform: { value: Vector3 },
	planetRadiusUniform: { value: number }
): MeshStandardNodeMaterial {
	const material = new MeshStandardNodeMaterial({
		side: DoubleSide,
		transparent: true,
		depthWrite: false,
		roughness: 0.7,
		metalness: 0.1
	});

	const shadow = planetShadowFactor(sunDirUniform, planetRadiusUniform);

	material.colorNode = Fn(() => {
		const u = uv();
		// u.x goes from inner to outer edge (0 to 1)
		const r = u.x;

		// Base ring color: icy cream to warm amber gradient
		const inner = vec3(0.78, 0.72, 0.6);
		const outer = vec3(0.65, 0.58, 0.48);
		const base = inner.mul(float(1.0).sub(r)).add(outer.mul(r));

		// B ring (bright, inner) and A ring (moderate, outer)
		const bRingBright = smoothstep(float(0.1), float(0.2), r)
			.mul(smoothstep(float(0.55), float(0.5), r))
			.mul(0.15);

		// Apply planet shadow darkening
		return base.add(bRingBright).mul(shadow);
	})();

	material.opacityNode = Fn(() => {
		const u = uv();
		const r = u.x;

		// Overall opacity profile: denser in middle, fading at edges
		const edgeFade = smoothstep(float(0.0), float(0.05), r)
			.mul(smoothstep(float(1.0), float(0.95), r));

		// Cassini Division: dark gap between B and A rings
		// Positioned at roughly 68-73% of the way from inner to outer
		const cassiniCenter = float(0.70);
		const cassiniWidth = float(0.025);
		const cassiniGap = float(1.0).sub(
			smoothstep(cassiniCenter.sub(cassiniWidth), cassiniCenter.sub(cassiniWidth.mul(0.5)), r)
				.mul(smoothstep(cassiniCenter.add(cassiniWidth), cassiniCenter.add(cassiniWidth.mul(0.5)), r))
		);

		// Ring density variation (concentric brightness rings)
		const ringlets = float(0.7).add(
			Fn(() => {
				const n1 = r.mul(60.0).sin().mul(0.1);
				const n2 = r.mul(120.0).sin().mul(0.05);
				return n1.add(n2);
			})()
		);

		// C ring (inner, very faint)
		const cRingFade = smoothstep(float(0.0), float(0.15), r).mul(0.3).add(0.7);

		return edgeFade.mul(cassiniGap).mul(ringlets).mul(cRingFade).mul(0.75);
	})();

	return material;
}

/**
 * Create a procedural ring material for Uranus.
 * Narrow, dark rings with low opacity.
 */
function uranusRingMaterial(
	sunDirUniform: { value: Vector3 },
	planetRadiusUniform: { value: number }
): MeshStandardNodeMaterial {
	const material = new MeshStandardNodeMaterial({
		side: DoubleSide,
		transparent: true,
		depthWrite: false,
		roughness: 0.9,
		metalness: 0.0
	});

	// Dark rings — low albedo particles, with planet shadow
	const shadow = planetShadowFactor(sunDirUniform, planetRadiusUniform);
	material.colorNode = vec3(0.25, 0.25, 0.28).mul(shadow);

	material.opacityNode = Fn(() => {
		const u = uv();
		const r = u.x;

		// Narrow ring bands (Uranus has thin, discrete rings)
		const epsilon = smoothstep(float(0.75), float(0.78), r)
			.mul(smoothstep(float(0.85), float(0.82), r));
		const inner1 = smoothstep(float(0.2), float(0.23), r)
			.mul(smoothstep(float(0.3), float(0.27), r));
		const inner2 = smoothstep(float(0.45), float(0.48), r)
			.mul(smoothstep(float(0.55), float(0.52), r));

		// Epsilon ring is brightest, inner rings fainter
		return epsilon.mul(0.5).add(inner1.mul(0.2)).add(inner2.mul(0.15));
	})();

	return material;
}

/**
 * Create a procedural ring material for Neptune.
 * Very faint rings, barely visible.
 */
function neptuneRingMaterial(
	sunDirUniform: { value: Vector3 },
	planetRadiusUniform: { value: number }
): MeshStandardNodeMaterial {
	const material = new MeshStandardNodeMaterial({
		side: DoubleSide,
		transparent: true,
		depthWrite: false,
		roughness: 0.9,
		metalness: 0.0
	});

	const shadow = planetShadowFactor(sunDirUniform, planetRadiusUniform);
	material.colorNode = vec3(0.3, 0.3, 0.35).mul(shadow);

	material.opacityNode = Fn(() => {
		const u = uv();
		const r = u.x;

		// Adams ring (outermost, with arcs)
		const adams = smoothstep(float(0.85), float(0.87), r)
			.mul(smoothstep(float(0.95), float(0.93), r));
		// Le Verrier ring (inner)
		const leverrier = smoothstep(float(0.45), float(0.47), r)
			.mul(smoothstep(float(0.55), float(0.53), r));

		return adams.mul(0.2).add(leverrier.mul(0.1));
	})();

	return material;
}

/**
 * Create a procedural ring material for Haumea.
 * Narrow ring (~70 km wide) discovered via stellar occultation in 2017.
 * Source: Ortiz et al. 2017, Nature 550, 219-223
 */
function haumeaRingMaterial(
	sunDirUniform: { value: Vector3 },
	planetRadiusUniform: { value: number }
): MeshStandardNodeMaterial {
	const material = new MeshStandardNodeMaterial({
		side: DoubleSide,
		transparent: true,
		depthWrite: false,
		roughness: 0.9,
		metalness: 0.0
	});

	// Dark, icy particles similar to Uranus ring material, with planet shadow
	const shadow = planetShadowFactor(sunDirUniform, planetRadiusUniform);
	material.colorNode = vec3(0.35, 0.32, 0.30).mul(shadow);

	material.opacityNode = Fn(() => {
		const u = uv();
		const r = u.x;

		// Single narrow ring band centered in the geometry
		const ringCenter = float(0.5);
		const ringWidth = float(0.3);
		const band = smoothstep(ringCenter.sub(ringWidth), ringCenter.sub(ringWidth.mul(0.5)), r)
			.mul(smoothstep(ringCenter.add(ringWidth), ringCenter.add(ringWidth.mul(0.5)), r));

		return band.mul(0.4);
	})();

	return material;
}

/** Ring material factory type — takes shadow uniforms. */
type RingMaterialFactory = (
	sunDirUniform: { value: Vector3 },
	planetRadiusUniform: { value: number }
) => MeshStandardNodeMaterial;

/** Map NAIF ID to ring material factory. */
const RING_MATERIAL_FACTORIES: Record<number, RingMaterialFactory> = {
	[SATURN]: saturnRingMaterial,
	[URANUS]: uranusRingMaterial,
	[NEPTUNE]: neptuneRingMaterial,
	[HAUMEA]: haumeaRingMaterial
};

/**
 * Manages rendering of planetary ring systems.
 *
 * Ring meshes are created as children of a Group that gets attached
 * to the parent planet's mesh, so they automatically follow position
 * and inherit axial tilt.
 *
 * Usage:
 * ```ts
 * const rings = new RingRenderer(bodies, { sizeExaggeration: 200 });
 * rings.attachTo(planetRenderer);
 * // Rings update automatically via parent mesh transforms.
 * ```
 */
export class RingRenderer {
	private rings: RingState[] = [];
	private sizeExaggeration: number;
	private opts: Required<RingRendererOptions>;

	constructor(bodies: SolarSystemBody[], options: RingRendererOptions = {}) {
		this.opts = { ...DEFAULTS, ...options };
		this.sizeExaggeration = this.opts.sizeExaggeration;

		for (const body of bodies) {
			if (!body.rings) continue;

			const factory = RING_MATERIAL_FACTORIES[body.naif_id];
			if (!factory) continue;

			this.createRing(body, body.rings, factory);
		}
	}

	private createRing(
		body: SolarSystemBody,
		ringData: RingSystem,
		materialFactory: RingMaterialFactory
	): void {
		const innerAU = (ringData.inner_radius_km / KM_PER_AU) * this.sizeExaggeration;
		const outerAU = (ringData.outer_radius_km / KM_PER_AU) * this.sizeExaggeration;

		const geometry = new RingGeometry(
			innerAU,
			outerAU,
			this.opts.tubularSegments,
			this.opts.radialSegments
		);

		// Fix UV mapping: RingGeometry UVs need to map u.x from inner→outer edge
		const pos = geometry.attributes.position;
		const uvAttr = geometry.attributes.uv;
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i);
			const z = pos.getZ(i);
			const dist = Math.sqrt(x * x + z * z);
			// Normalize distance to 0..1 (inner to outer)
			const t = (dist - innerAU) / (outerAU - innerAU);
			// Keep the angular coordinate for v
			uvAttr.setXY(i, t, uvAttr.getY(i));
		}
		uvAttr.needsUpdate = true;

		// Shadow uniforms: sun direction + planet radius in ring-local space
		const sunDirUniform = { value: new Vector3(1, 0, 0) };
		const planetRadiusAU = (body.radius_km / KM_PER_AU) * this.sizeExaggeration;
		const planetRadiusUniform = { value: planetRadiusAU };

		const material = materialFactory(sunDirUniform, planetRadiusUniform);
		const mesh = new Mesh(geometry, material);

		// Rings lie in the equatorial plane, which for Three.js means the XZ plane.
		// RingGeometry already creates in XZ, so no extra rotation needed.
		// The parent planet's axial tilt (mesh.rotation.z) will tilt the rings correctly.

		const group = new Group();
		group.add(mesh);

		this.rings.push({
			naifId: body.naif_id,
			mesh,
			geometry,
			material,
			group,
			innerKm: ringData.inner_radius_km,
			outerKm: ringData.outer_radius_km,
			planetRadiusKm: body.radius_km,
			sunDirUniform,
			planetRadiusUniform
		});
	}

	/**
	 * Attach ring groups to their parent planet meshes.
	 * The ring group becomes a child of the planet mesh.
	 *
	 * @param getMesh Function to retrieve a planet mesh by NAIF ID
	 */
	attachTo(getMesh: (naifId: number) => Mesh | undefined): void {
		for (const ring of this.rings) {
			const parentMesh = getMesh(ring.naifId);
			if (parentMesh) {
				parentMesh.add(ring.group);
			}
		}
	}

	/**
	 * Detach all ring groups from their parents.
	 */
	detach(): void {
		for (const ring of this.rings) {
			ring.group.removeFromParent();
		}
	}

	/**
	 * Update sun direction uniforms for ring shadow computation.
	 * Call once per frame after planet positions are updated.
	 *
	 * The sun direction in ring-local space is the direction from the ring
	 * (which is at the planet's world position) toward the sun (origin).
	 * Since rings are children of the planet mesh, we need the inverse of
	 * the planet's world rotation applied to the sun direction.
	 *
	 * @param getMesh Function to retrieve a planet mesh by NAIF ID
	 */
	update(getMesh: (naifId: number) => Mesh | undefined): void {
		const tempVec = new Vector3();
		const tempQuat = new Quaternion();

		for (const ring of this.rings) {
			const parentMesh = getMesh(ring.naifId);
			if (!parentMesh) continue;

			// Sun is at origin; direction from planet to sun = -planetPosition (normalized)
			tempVec.copy(parentMesh.position).negate().normalize();

			// Transform into ring-local space by applying inverse of parent's world rotation.
			// The ring is a child of the planet mesh, so it inherits the planet's rotation.
			tempQuat.copy(parentMesh.quaternion).invert();
			tempVec.applyQuaternion(tempQuat);

			ring.sunDirUniform.value.copy(tempVec);
		}
	}

	/** Update ring scale when planet size exaggeration changes. */
	setSizeExaggeration(factor: number): void {
		this.sizeExaggeration = factor;
		for (const ring of this.rings) {
			const innerAU = (ring.innerKm / KM_PER_AU) * factor;
			const outerAU = (ring.outerKm / KM_PER_AU) * factor;

			ring.geometry.dispose();
			ring.geometry = new RingGeometry(
				innerAU,
				outerAU,
				this.opts.tubularSegments,
				this.opts.radialSegments
			);

			// Recompute UVs
			const pos = ring.geometry.attributes.position;
			const uvAttr = ring.geometry.attributes.uv;
			for (let i = 0; i < pos.count; i++) {
				const x = pos.getX(i);
				const z = pos.getZ(i);
				const dist = Math.sqrt(x * x + z * z);
				const t = (dist - innerAU) / (outerAU - innerAU);
				uvAttr.setXY(i, t, uvAttr.getY(i));
			}
			uvAttr.needsUpdate = true;

			ring.mesh.geometry = ring.geometry;

			// Update planet radius uniform for shadow computation
			ring.planetRadiusUniform.value = (ring.planetRadiusKm / KM_PER_AU) * factor;
		}
	}

	/** Get a ring group by NAIF ID. */
	getGroup(naifId: number): Group | undefined {
		return this.rings.find((r) => r.naifId === naifId)?.group;
	}

	/**
	 * Apply a texture to a ring by parent body NAIF ID.
	 * Replaces the procedural TSL material with a textured standard material.
	 * The texture should be a radial strip (u = 0 at inner edge, u = 1 at outer).
	 */
	applyTexture(naifId: number, texture: Texture): void {
		const ring = this.rings.find((r) => r.naifId === naifId);
		if (!ring) return;

		// Replace procedural material with textured material
		ring.material.dispose();
		const newMat = new MeshStandardMaterial({
			map: texture,
			side: DoubleSide,
			transparent: true,
			depthWrite: false,
			roughness: 0.7,
			metalness: 0.1
		});
		ring.material = newMat as unknown as MeshStandardNodeMaterial;
		ring.mesh.material = newMat;
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const ring of this.rings) {
			ring.group.removeFromParent();
			ring.geometry.dispose();
			ring.material.dispose();
		}
		this.rings.length = 0;
	}
}
