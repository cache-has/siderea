/**
 * Renderer for notable small bodies (asteroids and KBOs) in the near scene.
 *
 * Follows the same pattern as DwarfPlanetRenderer: sphere meshes with
 * per-frame position updates from Keplerian ephemeris via WASM.
 *
 * Notable asteroids: 4 Vesta (2001), 2 Pallas (2002), 10 Hygiea (2003)
 * Notable KBOs: 50000 Quaoar (3001), 90377 Sedna (3002), 90482 Orcus (3003)
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Positions: heliocentric ecliptic J2000, converted from WASM (meters -> AU).
 */

import {
	SphereGeometry,
	Mesh,
	MeshStandardMaterial,
	MathUtils,
	Color
} from 'three/webgpu';
import type { Scene, Material } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';
import type { WasmEphemeris } from './planets';
import type { FramePositionCache } from './frame-position-cache';

/** Notable asteroid NAIF IDs. */
const ASTEROID_NAIF_IDS = [2001, 2002, 2003] as const;

/** Notable KBO NAIF IDs. */
const KBO_NAIF_IDS = [3001, 3002, 3003] as const;

/** All small body NAIF IDs. */
const ALL_NAIF_IDS = [...ASTEROID_NAIF_IDS, ...KBO_NAIF_IDS];

/** Approximate colors for small bodies. */
const SMALL_BODY_COLORS: Record<number, number> = {
	2001: 0x9a9080, // Vesta — warm gray (basaltic)
	2002: 0x7a7a7a, // Pallas — neutral gray (B-type)
	2003: 0x505048, // Hygiea — dark gray (C-type carbonaceous)
	3001: 0x8a8a90, // Quaoar — gray with slight blue
	3002: 0xb06050, // Sedna — reddish (tholin-coated)
	3003: 0x708080  // Orcus — blue-gray (water ice)
};

export interface SmallBodyRendererOptions {
	/** Size exaggeration factor. @default 200 */
	sizeExaggeration?: number;
	/** WASM module with get_body_position. */
	wasm?: WasmEphemeris;
}

/** Runtime state for a single small body. */
interface SmallBodyState {
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
 * Manages rendering of notable asteroids and KBOs in the near scene.
 *
 * Usage:
 * ```ts
 * const smallBodies = new SmallBodyRenderer(bodies, { wasm });
 * smallBodies.addTo(scene);
 * // In frame loop:
 * smallBodies.update(delta, currentJD);
 * ```
 */
export class SmallBodyRenderer {
	private bodies: SmallBodyState[] = [];
	private wasm: WasmEphemeris | null;
	private sizeExaggeration: number;

	constructor(bodies: SolarSystemBody[], options: SmallBodyRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.sizeExaggeration = options.sizeExaggeration ?? DEFAULTS.sizeExaggeration;

		for (const naifId of ALL_NAIF_IDS) {
			const body = bodies.find((b) => b.naif_id === naifId);
			if (!body) continue;

			const segments = 16; // small bodies — low detail is fine
			const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * this.sizeExaggeration;

			const geometry = new SphereGeometry(radiusAU, segments, segments);
			const material = new MeshStandardMaterial({
				color: new Color(SMALL_BODY_COLORS[naifId] ?? 0x888888),
				roughness: 0.95,
				metalness: 0.0
			});

			const mesh = new Mesh(geometry, material);

			// Apply axial tilt
			const tiltRad = MathUtils.degToRad(body.axial_tilt_deg);
			mesh.rotation.order = 'ZYX';
			mesh.rotation.z = tiltRad;

			// Rotation rate
			const periodSeconds = Math.abs(body.rotation_period_hours) * 3600;
			const direction = body.rotation_period_hours < 0 ? -1 : 1;
			const rotationRate = periodSeconds !== 0
				? direction * (2 * Math.PI) / periodSeconds
				: 0;

			this.bodies.push({
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

	/** Add all small body meshes to a scene. */
	addTo(scene: Scene): void {
		for (const sb of this.bodies) {
			scene.add(sb.mesh);
		}
	}

	/** Remove all small body meshes from a scene. */
	removeFrom(scene: Scene): void {
		for (const sb of this.bodies) {
			scene.remove(sb.mesh);
		}
	}

	/**
	 * Update small body positions and rotations. Call once per frame.
	 */
	update(delta: number, jd: number, cache?: FramePositionCache): void {
		for (const sb of this.bodies) {
			const cached = cache?.getBodyPositionAU(sb.naifId);
			if (cached) {
				sb.mesh.position.set(cached.x, cached.y, cached.z);
			} else if (this.wasm) {
				const pos = this.wasm.get_body_position(sb.naifId, jd);
				sb.mesh.position.set(
					pos[0] / METERS_PER_AU,
					pos[1] / METERS_PER_AU,
					pos[2] / METERS_PER_AU
				);
			}

			sb.rotationAngle += sb.rotationRate * delta;
			sb.mesh.rotation.y = sb.rotationAngle;
		}
	}

	/** Set or change the size exaggeration factor. */
	setSizeExaggeration(factor: number): void {
		this.sizeExaggeration = factor;
		for (const sb of this.bodies) {
			const radiusAU = (sb.body.radius_km / (METERS_PER_AU / 1000)) * factor;
			sb.geometry.dispose();
			sb.geometry = new SphereGeometry(radiusAU, 16, 16);
			sb.mesh.geometry = sb.geometry;
		}
	}

	/** Current size exaggeration factor. */
	get exaggeration(): number {
		return this.sizeExaggeration;
	}

	/** Get a mesh by NAIF ID. */
	getMesh(naifId: number): Mesh | undefined {
		return this.bodies.find((sb) => sb.naifId === naifId)?.mesh;
	}

	/** Get all meshes. */
	get meshes(): Mesh[] {
		return this.bodies.map((sb) => sb.mesh);
	}

	/** Get all NAIF IDs being rendered. */
	get naifIds(): number[] {
		return this.bodies.map((sb) => sb.naifId);
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const sb of this.bodies) {
			sb.mesh.removeFromParent();
			sb.geometry.dispose();
			sb.material.dispose();
		}
		this.bodies.length = 0;
	}
}
