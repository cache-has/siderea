/**
 * Man-made satellite / spacecraft renderer for the near (solar system) scene.
 *
 * Renders satellites as small glowing sprite dots with distinct colors per subtype.
 * Supports multiple orbit determination methods:
 *
 * - **TLE**: SGP4 propagation via WASM, TEME→J2000 frame transform, geocentric→heliocentric
 * - **Heliocentric**: Linear propagation from epoch state vector (deep-space probes)
 * - **Lagrange**: Fixed offset from parent body (e.g. JWST at Sun-Earth L2)
 * - **Constellation**: Procedurally generated representative satellites in orbital shells
 *
 * Surface markers and historical orbits are not rendered (no active position).
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 */

import {
	SpriteMaterial,
	Sprite,
	Color,
	AdditiveBlending,
	Vector3
} from 'three/webgpu';
import type { Scene } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import type { Satellite, SatelliteOrbitType } from '$lib/data/types';
import { tleEpochToJD, type TleData } from '$lib/data/celestrak';

// Re-export for backward compatibility with tests and other consumers
export { tleEpochToJD };

// ---------------------------------------------------------------------------
// WASM interface
// ---------------------------------------------------------------------------

/** WASM functions needed for satellite position updates. */
export interface WasmSatelliteEphemeris {
	get_body_position(body_id: number, julian_date: number): Float64Array;
	propagate_tle(tle_line1: string, tle_line2: string, minutes_since_epoch: number): Float64Array;
	transform_coordinates(
		x: number, y: number, z: number,
		vx: number, vy: number, vz: number,
		from_frame: string, to_frame: string,
		jd: number
	): Float64Array;
}

// ---------------------------------------------------------------------------
// TLE data store (loaded from snapshot, updatable at runtime)
// ---------------------------------------------------------------------------

/**
 * Active TLE data keyed by NORAD catalog ID.
 * Initially empty — populated by loadTleSnapshot() or updateTles().
 */
const activeTles = new Map<number, TleData>();

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

/** Sprite colors by satellite subtype. */
const SUBTYPE_COLORS: Record<string, number> = {
	space_station: 0xffffff,  // bright white
	telescope: 0x66ddff,      // cyan
	probe: 0xffcc44,          // gold/amber
	constellation: 0x88aacc,  // dim blue-white
	historical: 0x886644      // dim brown (not rendered, but just in case)
};

/** Sun-Earth L2 distance in AU (~1.5 million km). */
const L2_DISTANCE_AU = 1.5e9 / METERS_PER_AU; // ~0.01 AU

/** Earth's NAIF ID for VSOP87 position lookup. */
const EARTH_NAIF = 3;

// ---------------------------------------------------------------------------
// Constellation generation
// ---------------------------------------------------------------------------

/** Orbital shell definition for generating representative constellation satellites. */
interface ConstellationShell {
	altitudeKm: number;
	inclinationDeg: number;
	count: number;
	planes: number;
}

const CONSTELLATION_SHELLS: Record<string, ConstellationShell> = {
	starlink_representative: { altitudeKm: 550, inclinationDeg: 53, count: 100, planes: 20 },
	gps_representative: { altitudeKm: 20200, inclinationDeg: 55, count: 31, planes: 6 }
};

const EARTH_RADIUS_KM = 6371;

/**
 * Generate evenly-distributed representative satellite positions in a circular shell.
 * Returns positions in km relative to Earth center, in an Earth-fixed-ish frame
 * (we rotate them around Earth's position in the ecliptic).
 */
export function generateConstellationPositions(shell: ConstellationShell): Vector3[] {
	const positions: Vector3[] = [];
	const orbitRadiusKm = EARTH_RADIUS_KM + shell.altitudeKm;
	const incRad = (shell.inclinationDeg * Math.PI) / 180;
	const satsPerPlane = Math.ceil(shell.count / shell.planes);

	for (let plane = 0; plane < shell.planes; plane++) {
		const raan = (plane / shell.planes) * 2 * Math.PI;

		const satsThisPlane = Math.min(satsPerPlane, shell.count - plane * satsPerPlane);
		if (satsThisPlane <= 0) break;

		for (let s = 0; s < satsThisPlane; s++) {
			const trueAnomaly = (s / satsThisPlane) * 2 * Math.PI;

			// Position in orbital plane
			const xOrb = orbitRadiusKm * Math.cos(trueAnomaly);
			const yOrb = orbitRadiusKm * Math.sin(trueAnomaly);

			// Rotate by inclination (around x-axis of orbital plane)
			const xInc = xOrb;
			const yInc = yOrb * Math.cos(incRad);
			const zInc = yOrb * Math.sin(incRad);

			// Rotate by RAAN (around z-axis)
			const x = xInc * Math.cos(raan) - yInc * Math.sin(raan);
			const y = xInc * Math.sin(raan) + yInc * Math.cos(raan);
			const z = zInc;

			positions.push(new Vector3(x, y, z));
		}
	}

	return positions;
}

// ---------------------------------------------------------------------------
// Renderer options & state
// ---------------------------------------------------------------------------

export interface SatelliteRendererOptions {
	/** WASM module for TLE propagation and coordinate transforms. */
	wasm?: WasmSatelliteEphemeris;

	/**
	 * Sprite size in AU for individual satellites.
	 * @default 0.008
	 */
	spriteSize?: number;

	/**
	 * Sprite size in AU for constellation member dots.
	 * @default 0.003
	 */
	constellationSpriteSize?: number;
}

/** Runtime state for a single rendered satellite (or constellation member). */
interface SatelliteState {
	id: string;
	satellite: Satellite;
	sprite: Sprite;
	material: SpriteMaterial;
	orbitType: SatelliteOrbitType;
	/** Cached launch date as JD for per-frame comparison. */
	launchJD: number;
}

/** Runtime state for a constellation's representative satellites. */
interface ConstellationState {
	id: string;
	satellite: Satellite;
	sprites: Sprite[];
	materials: SpriteMaterial[];
	/** Pre-computed positions in km relative to Earth center. */
	localPositionsKm: Vector3[];
	/** Cached launch date as JD for per-frame comparison. */
	launchJD: number;
}

const DEFAULTS = {
	spriteSize: 0.008,
	constellationSpriteSize: 0.003
};

// ---------------------------------------------------------------------------
// SatelliteRenderer
// ---------------------------------------------------------------------------

/**
 * Renders man-made satellites and spacecraft in the near scene.
 *
 * Usage:
 * ```ts
 * const sats = new SatelliteRenderer(catalog.satellites, { wasm });
 * sats.addTo(scene);
 * // In frame loop:
 * sats.update(jd);
 * ```
 */
export class SatelliteRenderer {
	private individuals: SatelliteState[] = [];
	private constellations: ConstellationState[] = [];
	private wasm: WasmSatelliteEphemeris | null;
	private spriteSize: number;
	private constellationSpriteSize: number;

	/** Reusable vector for Earth position lookups. */
	private earthPosAU = new Vector3();

	constructor(satellites: Satellite[], options: SatelliteRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.spriteSize = options.spriteSize ?? DEFAULTS.spriteSize;
		this.constellationSpriteSize = options.constellationSpriteSize ?? DEFAULTS.constellationSpriteSize;

		for (const sat of satellites) {
			// Skip types we don't render
			if (sat.orbit_type === 'surface_marker' || sat.orbit_type === 'historical_orbit') {
				continue;
			}

			const color = SUBTYPE_COLORS[sat.subtype] ?? 0xcccccc;

			if (sat.subtype === 'constellation' && CONSTELLATION_SHELLS[sat.id]) {
				this.createConstellation(sat, color);
			} else {
				this.createIndividual(sat, color);
			}
		}
	}

	private createIndividual(sat: Satellite, color: number): void {
		const material = new SpriteMaterial({
			color: new Color(color),
			transparent: true,
			opacity: 0.85,
			blending: AdditiveBlending,
			depthWrite: false
		});
		const sprite = new Sprite(material);
		sprite.scale.set(this.spriteSize, this.spriteSize, 1);

		this.individuals.push({
			id: sat.id,
			satellite: sat,
			sprite,
			material,
			orbitType: sat.orbit_type,
			launchJD: sat.launch_date ? isoToJD(sat.launch_date) : -Infinity
		});
	}

	private createConstellation(sat: Satellite, color: number): void {
		const shell = CONSTELLATION_SHELLS[sat.id];
		const localPositions = generateConstellationPositions(shell);

		const sprites: Sprite[] = [];
		const materials: SpriteMaterial[] = [];

		for (let i = 0; i < localPositions.length; i++) {
			const mat = new SpriteMaterial({
				color: new Color(color),
				transparent: true,
				opacity: 0.4,
				blending: AdditiveBlending,
				depthWrite: false
			});
			const spr = new Sprite(mat);
			spr.scale.set(this.constellationSpriteSize, this.constellationSpriteSize, 1);
			sprites.push(spr);
			materials.push(mat);
		}

		this.constellations.push({
			id: sat.id,
			satellite: sat,
			sprites,
			materials,
			localPositionsKm: localPositions,
			launchJD: sat.launch_date ? isoToJD(sat.launch_date) : -Infinity
		});
	}

	/** Provide or replace the WASM module. */
	setWasm(wasm: WasmSatelliteEphemeris): void {
		this.wasm = wasm;
	}

	/** Add all satellite sprites to a scene. */
	addTo(scene: Scene): void {
		for (const s of this.individuals) {
			scene.add(s.sprite);
		}
		for (const c of this.constellations) {
			for (const spr of c.sprites) {
				scene.add(spr);
			}
		}
	}

	/** Remove all satellite sprites from a scene. */
	removeFrom(scene: Scene): void {
		for (const s of this.individuals) {
			scene.remove(s.sprite);
		}
		for (const c of this.constellations) {
			for (const spr of c.sprites) {
				scene.remove(spr);
			}
		}
	}

	/**
	 * Update all satellite positions. Call once per frame.
	 * @param jd Current Julian Date
	 * @param cache Optional batched position cache (used for Earth position lookup)
	 */
	update(jd: number, cache?: import('./frame-position-cache').FramePositionCache): void {
		if (!this.wasm) return;

		// Get Earth's heliocentric position — prefer batch cache
		const cachedEarth = cache?.getBodyPositionAU(EARTH_NAIF);
		if (cachedEarth) {
			this.earthPosAU.set(cachedEarth.x, cachedEarth.y, cachedEarth.z);
		} else {
			const earthPos = this.wasm.get_body_position(EARTH_NAIF, jd);
			this.earthPosAU.set(
				earthPos[0] / METERS_PER_AU,
				earthPos[1] / METERS_PER_AU,
				earthPos[2] / METERS_PER_AU
			);
		}

		// Update individual satellites
		for (const s of this.individuals) {
			// Hide satellites before their launch date
			if (jd < s.launchJD) {
				s.sprite.visible = false;
				continue;
			}
			s.sprite.visible = true;

			switch (s.orbitType) {
				case 'tle':
					this.updateTle(s, jd);
					break;
				case 'heliocentric':
					this.updateHeliocentric(s, jd);
					break;
				case 'lagrange':
					this.updateLagrange(s);
					break;
			}
		}

		// Update constellations (all orbit Earth)
		for (const c of this.constellations) {
			// Hide constellation before first launch
			if (jd < c.launchJD) {
				for (const spr of c.sprites) spr.visible = false;
				continue;
			}
			for (const spr of c.sprites) spr.visible = true;
			this.updateConstellation(c, jd);
		}
	}

	/**
	 * Update a TLE-tracked satellite: SGP4 propagation in TEME,
	 * transform to J2000, offset by Earth's heliocentric position.
	 */
	private updateTle(s: SatelliteState, jd: number): void {
		const noradId = s.satellite.norad_id;
		if (!noradId || !this.wasm) return;

		const tle = activeTles.get(noradId);
		if (!tle) return;

		const minutesSinceEpoch = (jd - tle.epochJd) * 24 * 60;

		try {
			// SGP4 returns [x, y, z] in km (TEME frame)
			const posKmTeme = this.wasm.propagate_tle(tle.line1, tle.line2, minutesSinceEpoch);

			// Convert km → meters for transform_coordinates
			const xM = posKmTeme[0] * 1000;
			const yM = posKmTeme[1] * 1000;
			const zM = posKmTeme[2] * 1000;

			// Transform TEME → J2000 (geocentric, meters)
			const j2000 = this.wasm.transform_coordinates(
				xM, yM, zM, 0, 0, 0,
				'TEME', 'J2000', jd
			);

			// Geocentric J2000 meters → AU, then add Earth's heliocentric position
			const x = j2000[0] / METERS_PER_AU + this.earthPosAU.x;
			const y = j2000[1] / METERS_PER_AU + this.earthPosAU.y;
			const z = j2000[2] / METERS_PER_AU + this.earthPosAU.z;

			s.sprite.position.set(x, y, z);
		} catch {
			// SGP4 can fail for stale TLEs — hide the sprite
			s.sprite.visible = false;
		}
	}

	/**
	 * Update a heliocentric probe: linear propagation from epoch state vector.
	 * Accurate for objects far from any gravitational well.
	 */
	private updateHeliocentric(s: SatelliteState, jd: number): void {
		const state = s.satellite.heliocentric_state;
		if (!state) return;

		// Compute time since epoch in days
		const epochJd = isoToJD(state.epoch);
		const dtDays = jd - epochJd;

		// Linear propagation: position = r0 + v * dt (all in AU and AU/day)
		const x = state.x_au + state.vx_au_day * dtDays;
		const y = state.y_au + state.vy_au_day * dtDays;
		const z = state.z_au + state.vz_au_day * dtDays;

		s.sprite.position.set(x, y, z);
	}

	/**
	 * Update a Lagrange-point satellite: offset from Earth in anti-sunward direction.
	 * Currently only supports Sun-Earth L2 (SEL2).
	 */
	private updateLagrange(s: SatelliteState): void {
		if (s.satellite.lagrange_point !== 'SEL2') return;

		// L2 is anti-sunward from Earth at ~1.5 million km
		// Direction: Earth position normalized (since Sun is at origin) × L2 distance
		const dir = this.earthPosAU.clone().normalize();
		const l2Pos = this.earthPosAU.clone().add(dir.multiplyScalar(L2_DISTANCE_AU));

		s.sprite.position.copy(l2Pos);
	}

	/**
	 * Update constellation representative satellites: rotate pre-computed
	 * local positions around Earth's current heliocentric position.
	 */
	private updateConstellation(c: ConstellationState, jd: number): void {
		// Simple rotation: advance RAAN-like angle based on time to show orbital motion
		// Use a slow rotation rate so the shell doesn't look static
		const rotRate = 0.0001; // radians per JD (very slow, just for visual variety)
		const angle = jd * rotRate;
		const cosA = Math.cos(angle);
		const sinA = Math.sin(angle);

		for (let i = 0; i < c.localPositionsKm.length; i++) {
			const local = c.localPositionsKm[i];

			// Rotate around ecliptic z-axis by time-dependent angle
			const xKm = local.x * cosA - local.y * sinA;
			const yKm = local.x * sinA + local.y * cosA;
			const zKm = local.z;

			// km → AU, offset by Earth's heliocentric position
			const KM_PER_AU = METERS_PER_AU / 1000;
			const x = xKm / KM_PER_AU + this.earthPosAU.x;
			const y = yKm / KM_PER_AU + this.earthPosAU.y;
			const z = zKm / KM_PER_AU + this.earthPosAU.z;

			c.sprites[i].position.set(x, y, z);
		}
	}

	/** Get a satellite sprite by ID. */
	getSprite(id: string): Sprite | undefined {
		const individual = this.individuals.find((s) => s.id === id);
		if (individual) return individual.sprite;
		// For constellations, return the first sprite as representative
		const constellation = this.constellations.find((c) => c.id === id);
		return constellation?.sprites[0];
	}

	/** Get all individual satellite IDs being rendered. */
	get satelliteIds(): string[] {
		return [
			...this.individuals.map((s) => s.id),
			...this.constellations.map((c) => c.id)
		];
	}

	/** Total number of rendered sprites (individuals + all constellation members). */
	get spriteCount(): number {
		return this.individuals.length +
			this.constellations.reduce((sum, c) => sum + c.sprites.length, 0);
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const s of this.individuals) {
			s.sprite.removeFromParent();
			s.material.dispose();
		}
		for (const c of this.constellations) {
			for (let i = 0; i < c.sprites.length; i++) {
				c.sprites[i].removeFromParent();
				c.materials[i].dispose();
			}
		}
		this.individuals.length = 0;
		this.constellations.length = 0;
	}
}

// ---------------------------------------------------------------------------
// TLE store management (module-level, shared across renderer instances)
// ---------------------------------------------------------------------------

/**
 * Load baked TLE data from a snapshot map (e.g. from loadTleSnapshot()).
 * Does not overwrite entries already set by a runtime update.
 */
export function loadSnapshotTles(snapshot: Map<number, TleData>): void {
	for (const [noradId, tle] of snapshot) {
		if (!activeTles.has(noradId)) {
			activeTles.set(noradId, tle);
		}
	}
}

/**
 * Update TLEs at runtime (e.g. from a CelesTrak fetch).
 * Overwrites existing entries unconditionally.
 */
export function updateTles(tles: Map<number, TleData>): void {
	for (const [noradId, tle] of tles) {
		activeTles.set(noradId, tle);
	}
}

/** Get the active TLE for a NORAD ID, or undefined if none loaded. */
export function getActiveTle(noradId: number): TleData | undefined {
	return activeTles.get(noradId);
}

/** Get all active TLE NORAD IDs. */
export function getActiveTleIds(): number[] {
	return [...activeTles.keys()];
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Convert an ISO 8601 date string to Julian Date.
 * Supports "YYYY-MM-DDTHH:MM:SSZ" format.
 */
function isoToJD(iso: string): number {
	const date = new Date(iso);
	return 2440587.5 + date.getTime() / 86_400_000;
}
