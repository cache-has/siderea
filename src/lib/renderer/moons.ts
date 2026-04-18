/**
 * Moon renderer for the near (solar system) scene.
 *
 * Renders major moons as spheres positioned around their parent planets:
 * - Earth's Moon (301): position from Meeus Ch.47 via WASM
 * - Galilean moons (501–504): Keplerian ephemeris around Jupiter
 * - Titan (606), Enceladus (602): Keplerian around Saturn
 * - Miranda (705): Keplerian around Uranus
 * - Triton (801): retrograde Keplerian around Neptune
 * - Phobos (401), Deimos (402): Keplerian around Mars
 * - Charon (901): Keplerian around Pluto
 *
 * Each moon uses a Group parented at the parent planet's heliocentric position,
 * with the moon mesh offset by the parent-centric position from WASM.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Positions: WASM returns meters; converted to AU with size/distance exaggeration.
 *
 * Sources:
 * - Moon radii: JPL Planetary Satellite Physical Parameters
 * - Orbital elements: JPL SAT441, URA111, NEP097, MAR097, JUP365 ephemerides
 * - 1 AU = 149,597,870.7 km (IAU 2012 exact)
 */

import {
	SphereGeometry,
	Mesh,
	MeshStandardMaterial,
	Group,
	Color
} from 'three/webgpu';
import type { Scene, Mesh as MeshType, Texture } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';
import type { FramePositionCache } from './frame-position-cache';

/** WASM interface for moon position queries. */
export interface WasmMoonEphemeris {
	/** Parent-centric position in meters (ecliptic J2000). */
	get_satellite_position(moon_id: number, julian_date: number): Float64Array;
}

export interface MoonRendererOptions {
	/**
	 * Size exaggeration for moon radii.
	 * Same factor as planets — moons will be visually scaled.
	 * @default 200
	 */
	sizeExaggeration?: number;

	/**
	 * Distance exaggeration multiplier applied on top of sizeExaggeration.
	 * Controls how far moons are rendered from their parent.
	 * At 1.0, orbital distance gets the same exaggeration as size.
	 * Values < 1.0 bring moons closer (useful for tiny orbits like Phobos).
	 * @default 0.5
	 */
	distanceExaggeration?: number;

	/** WASM module for moon position queries. */
	wasm?: WasmMoonEphemeris;
}

/** Moon colors by NAIF ID. */
const MOON_COLORS: Record<number, number> = {
	301: 0x888888, // Moon — gray
	401: 0x8b7d6b, // Phobos — dark brown-gray
	402: 0x9b8b7b, // Deimos — lighter brown-gray
	501: 0xccaa44, // Io — yellow-orange (sulfur)
	502: 0xb0c4de, // Europa — ice blue-white
	503: 0x9b8b7b, // Ganymede — gray-brown
	504: 0x7a7a7a, // Callisto — dark gray
	602: 0xeeeeee, // Enceladus — bright white (ice)
	606: 0xcc9944, // Titan — orange (haze)
	705: 0xaaaaaa, // Miranda — gray
	801: 0xc8b8a8, // Triton — pinkish-gray
	901: 0x999999  // Charon — neutral gray
};

/** Sphere segments by moon size class. */
function segmentsForMoon(naifId: number): number {
	// Large moons get more segments
	if ([301, 503, 504, 606].includes(naifId)) return 24;
	if ([501, 502, 801].includes(naifId)) return 20;
	return 16; // small moons
}

/** Map moon NAIF ID to parent planet NAIF ID. */
function parentPlanetId(moonId: number): number {
	if (moonId === 301) return 3;
	return Math.floor(moonId / 100);
}

/** Runtime state for a single moon. */
interface MoonState {
	naifId: number;
	parentNaifId: number;
	body: SolarSystemBody;
	mesh: Mesh;
	geometry: SphereGeometry;
	material: MeshStandardMaterial;
	/** Group positioned at parent planet's heliocentric position. */
	group: Group;
}

const DEFAULTS = {
	sizeExaggeration: 200,
	distanceExaggeration: 0.5
};

/**
 * Renders all major moons in the near scene.
 *
 * Usage:
 * ```ts
 * const moons = getBodiesByType(catalog, 'moon');
 * const moonRenderer = new MoonRenderer(moons, { wasm });
 * moonRenderer.addTo(scene);
 * // In frame loop:
 * moonRenderer.update(jd, getParentPosition);
 * ```
 */
export class MoonRenderer {
	private moons: MoonState[] = [];
	private wasm: WasmMoonEphemeris | null;
	private sizeExaggeration: number;
	private distanceExaggeration: number;
	/** Groups indexed by parent NAIF ID (shared between moons of same parent). */
	private parentGroups = new Map<number, Group>();

	constructor(bodies: SolarSystemBody[], options: MoonRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.sizeExaggeration = options.sizeExaggeration ?? DEFAULTS.sizeExaggeration;
		this.distanceExaggeration = options.distanceExaggeration ?? DEFAULTS.distanceExaggeration;

		for (const body of bodies) {
			if (body.type !== 'moon') continue;
			if (body.naif_id < 0) continue; // skip moons without NAIF IDs

			const naifId = body.naif_id;
			const parentNaifId = parentPlanetId(naifId);
			const segments = segmentsForMoon(naifId);
			const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * this.sizeExaggeration;

			const geometry = new SphereGeometry(radiusAU, segments, segments);
			const material = new MeshStandardMaterial({
				color: new Color(MOON_COLORS[naifId] ?? 0x888888),
				roughness: 0.9,
				metalness: 0.0
			});

			// Titan: slight emissive tint for hazy atmosphere
			if (naifId === 606) {
				material.emissive = new Color(0x332200);
				material.emissiveIntensity = 0.15;
			}

			const mesh = new Mesh(geometry, material);

			// Get or create parent group
			let group = this.parentGroups.get(parentNaifId);
			if (!group) {
				group = new Group();
				this.parentGroups.set(parentNaifId, group);
			}
			group.add(mesh);

			this.moons.push({
				naifId,
				parentNaifId,
				body,
				mesh,
				geometry,
				material,
				group
			});
		}
	}

	/** Provide or replace the WASM module. */
	setWasm(wasm: WasmMoonEphemeris): void {
		this.wasm = wasm;
	}

	/** Add all moon groups to a scene. */
	addTo(scene: Scene): void {
		for (const group of this.parentGroups.values()) {
			scene.add(group);
		}
	}

	/** Remove all moon groups from a scene. */
	removeFrom(scene: Scene): void {
		for (const group of this.parentGroups.values()) {
			scene.remove(group);
		}
	}

	/**
	 * Update moon positions. Call once per frame.
	 *
	 * @param jd Current Julian Date for ephemeris queries
	 * @param getParentMesh Function to get a parent planet's mesh by NAIF ID
	 *        (used to position the moon group at the parent's current location)
	 */
	update(jd: number, getParentMesh: (naifId: number) => MeshType | undefined, cache?: FramePositionCache): void {
		// Position each parent group at the parent planet's current location
		for (const [parentId, group] of this.parentGroups) {
			const parentMesh = getParentMesh(parentId);
			if (parentMesh) {
				group.position.copy(parentMesh.position);
			}
		}

		// Update each moon's position relative to parent
		const scale = this.sizeExaggeration * this.distanceExaggeration / METERS_PER_AU;

		for (const moon of this.moons) {
			const cached = cache?.getMoonPositionMeters(moon.naifId);
			if (cached) {
				moon.mesh.position.set(
					cached.x * scale,
					cached.y * scale,
					cached.z * scale
				);
			} else if (this.wasm) {
				try {
					const pos = this.wasm.get_satellite_position(moon.naifId, jd);
					moon.mesh.position.set(
						pos[0] * scale,
						pos[1] * scale,
						pos[2] * scale
					);
				} catch {
					// Silently skip if WASM call fails (e.g. unknown moon ID)
				}
			}
		}
	}

	/**
	 * Set or change the size exaggeration factor.
	 * Rebuilds all sphere geometries at the new scale.
	 */
	setSizeExaggeration(factor: number): void {
		this.sizeExaggeration = factor;
		for (const moon of this.moons) {
			const radiusAU = (moon.body.radius_km / (METERS_PER_AU / 1000)) * factor;
			const segments = segmentsForMoon(moon.naifId);
			moon.geometry.dispose();
			moon.geometry = new SphereGeometry(radiusAU, segments, segments);
			moon.mesh.geometry = moon.geometry;
		}
	}

	/** Get a moon mesh by NAIF ID. */
	getMesh(naifId: number): Mesh | undefined {
		return this.moons.find((m) => m.naifId === naifId)?.mesh;
	}

	/** Get the parent group for a given parent NAIF ID. */
	getParentGroup(parentNaifId: number): Group | undefined {
		return this.parentGroups.get(parentNaifId);
	}

	/** Get all moon NAIF IDs being rendered. */
	get moonIds(): number[] {
		return this.moons.map((m) => m.naifId);
	}

	/** Current size exaggeration factor. */
	get exaggeration(): number {
		return this.sizeExaggeration;
	}

	/** Apply a pre-loaded texture to a moon by NAIF ID. */
	applyTexture(naifId: number, texture: Texture): void {
		const moon = this.moons.find((m) => m.naifId === naifId);
		if (!moon) return;

		moon.material.map = texture;
		moon.material.needsUpdate = true;
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const moon of this.moons) {
			moon.mesh.removeFromParent();
			moon.geometry.dispose();
			moon.material.dispose();
		}
		this.moons.length = 0;

		for (const group of this.parentGroups.values()) {
			group.removeFromParent();
		}
		this.parentGroups.clear();
	}
}
