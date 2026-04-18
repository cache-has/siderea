/**
 * Dwarf planet renderer for the near (solar system) scene.
 *
 * Renders dwarf planets as spheres with:
 * - Correct relative sizes (exaggerated for visibility)
 * - Axial tilt and per-frame sidereal rotation
 * - Per-frame position updates from Keplerian ephemeris via WASM
 *
 * Supported bodies:
 * - Pluto (9): Kuiper belt, binary with Charon
 * - Ceres (10): asteroid belt
 * - Eris (11): scattered disc
 * - Haumea (12): Kuiper belt, rapid rotator with ring
 * - Makemake (13): Kuiper belt
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Positions: heliocentric ecliptic J2000, converted from WASM (meters -> AU).
 *
 * Sources:
 * - Dwarf planet radii: NASA/JPL Small-Body Database
 * - Orbital elements: JPL SBDB osculating elements at J2000.0
 * - 1 AU = 149,597,870.7 km (IAU 2012 exact)
 */

import {
	SphereGeometry,
	Mesh,
	MeshStandardMaterial,
	MathUtils,
	Color
} from 'three/webgpu';
import type { Scene, Material, Texture } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';
import type { WasmEphemeris } from './planets';
import type { FramePositionCache } from './frame-position-cache';

/** Dwarf planet NAIF IDs. */
const DWARF_PLANET_NAIF_IDS = [9, 10, 11, 12, 13] as const;

/** Approximate dwarf planet colors. */
const DWARF_PLANET_COLORS: Record<number, number> = {
	9: 0xc8b496,   // Pluto — pale tan (nitrogen ice)
	10: 0x8a8a8a,  // Ceres — gray
	11: 0xdedede,  // Eris — nearly white (methane frost)
	12: 0xb0a090,  // Haumea — dark red-brown
	13: 0xc8a080   // Makemake — reddish-brown
};

export interface DwarfPlanetRendererOptions {
	/**
	 * Size exaggeration factor applied to dwarf planet radii.
	 * @default 200
	 */
	sizeExaggeration?: number;

	/**
	 * WASM module with get_body_position(body_id, jd) -> Float64Array.
	 */
	wasm?: WasmEphemeris;
}

/** Runtime state for a single dwarf planet. */
interface DwarfPlanetState {
	naifId: number;
	body: SolarSystemBody;
	mesh: Mesh;
	geometry: SphereGeometry;
	material: Material;
	rotationAngle: number;
	rotationRate: number;
}

const DEFAULTS = {
	sizeExaggeration: 200
};

/**
 * Manages rendering of dwarf planets in the near scene.
 *
 * Usage:
 * ```ts
 * const dwarfs = new DwarfPlanetRenderer(bodies, { wasm });
 * dwarfs.addTo(scene);
 * // In frame loop:
 * dwarfs.update(delta, currentJD);
 * ```
 */
export class DwarfPlanetRenderer {
	private dwarfPlanets: DwarfPlanetState[] = [];
	private wasm: WasmEphemeris | null;
	private sizeExaggeration: number;

	constructor(bodies: SolarSystemBody[], options: DwarfPlanetRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.sizeExaggeration = options.sizeExaggeration ?? DEFAULTS.sizeExaggeration;

		for (const naifId of DWARF_PLANET_NAIF_IDS) {
			const body = bodies.find((b) => b.naif_id === naifId);
			if (!body) continue;

			// Dwarf planets are small — 24 segments is sufficient
			const segments = 24;
			const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * this.sizeExaggeration;

			const geometry = new SphereGeometry(radiusAU, segments, segments);
			const material = new MeshStandardMaterial({
				color: new Color(DWARF_PLANET_COLORS[naifId] ?? 0x888888),
				roughness: 0.9,
				metalness: 0.0
			});

			const mesh = new Mesh(geometry, material);

			// Apply axial tilt
			const tiltRad = MathUtils.degToRad(body.axial_tilt_deg);
			mesh.rotation.order = 'ZYX';
			mesh.rotation.z = tiltRad;

			// Rotation rate: sidereal period in hours -> radians/second
			// Negative rotation_period_hours means retrograde rotation (Pluto)
			const periodSeconds = Math.abs(body.rotation_period_hours) * 3600;
			const direction = body.rotation_period_hours < 0 ? -1 : 1;
			const rotationRate = periodSeconds !== 0
				? direction * (2 * Math.PI) / periodSeconds
				: 0;

			this.dwarfPlanets.push({
				naifId,
				body,
				mesh,
				geometry,
				material,
				rotationAngle: 0,
				rotationRate
			});
		}
	}

	/** Provide or replace the WASM ephemeris module. */
	setWasm(wasm: WasmEphemeris): void {
		this.wasm = wasm;
	}

	/** Add all dwarf planet meshes to a scene. */
	addTo(scene: Scene): void {
		for (const dp of this.dwarfPlanets) {
			scene.add(dp.mesh);
		}
	}

	/** Remove all dwarf planet meshes from a scene. */
	removeFrom(scene: Scene): void {
		for (const dp of this.dwarfPlanets) {
			scene.remove(dp.mesh);
		}
	}

	/**
	 * Update dwarf planet positions and rotations. Call once per frame.
	 *
	 * @param delta Frame delta time in seconds
	 * @param jd Current Julian Date for ephemeris queries
	 * @param cache Optional batched position cache
	 */
	update(delta: number, jd: number, cache?: FramePositionCache): void {
		for (const dp of this.dwarfPlanets) {
			const cached = cache?.getBodyPositionAU(dp.naifId);
			if (cached) {
				dp.mesh.position.set(cached.x, cached.y, cached.z);
			} else if (this.wasm) {
				const pos = this.wasm.get_body_position(dp.naifId, jd);
				dp.mesh.position.set(
					pos[0] / METERS_PER_AU,
					pos[1] / METERS_PER_AU,
					pos[2] / METERS_PER_AU
				);
			}

			// Accumulate sidereal rotation
			dp.rotationAngle += dp.rotationRate * delta;
			dp.mesh.rotation.y = dp.rotationAngle;
		}
	}

	/**
	 * Set or change the size exaggeration factor.
	 * Rebuilds all sphere geometries at the new scale.
	 */
	setSizeExaggeration(factor: number): void {
		this.sizeExaggeration = factor;
		for (const dp of this.dwarfPlanets) {
			const radiusAU = (dp.body.radius_km / (METERS_PER_AU / 1000)) * factor;
			dp.geometry.dispose();
			dp.geometry = new SphereGeometry(radiusAU, 24, 24);
			dp.mesh.geometry = dp.geometry;
		}
	}

	/** Current size exaggeration factor. */
	get exaggeration(): number {
		return this.sizeExaggeration;
	}

	/** Get a dwarf planet mesh by NAIF ID. */
	getMesh(naifId: number): Mesh | undefined {
		return this.dwarfPlanets.find((dp) => dp.naifId === naifId)?.mesh;
	}

	/** Get all dwarf planet meshes. */
	get meshes(): Mesh[] {
		return this.dwarfPlanets.map((dp) => dp.mesh);
	}

	/** Get all dwarf planet NAIF IDs being rendered. */
	get naifIds(): number[] {
		return this.dwarfPlanets.map((dp) => dp.naifId);
	}

	/** Apply a pre-loaded texture to a dwarf planet by NAIF ID. */
	applyTexture(naifId: number, texture: Texture): void {
		const dp = this.dwarfPlanets.find((d) => d.naifId === naifId);
		if (!dp) return;

		if (!(dp.material instanceof MeshStandardMaterial)) {
			dp.material.dispose();
			dp.material = new MeshStandardMaterial({
				roughness: 0.9,
				metalness: 0.0
			});
			dp.mesh.material = dp.material;
		}

		(dp.material as MeshStandardMaterial).map = texture;
		(dp.material as MeshStandardMaterial).needsUpdate = true;
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const dp of this.dwarfPlanets) {
			dp.mesh.removeFromParent();
			dp.geometry.dispose();
			dp.material.dispose();
		}
		this.dwarfPlanets.length = 0;
	}
}
