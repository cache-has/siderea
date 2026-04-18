/**
 * Planet renderer for the near (solar system) scene.
 *
 * Renders all 8 planets as spheres with:
 * - Procedural TSL node materials (unique per planet)
 * - Correct relative sizes (exaggerated for visibility, with real-scale toggle)
 * - Axial tilt and per-frame sidereal rotation
 * - Per-frame position updates from VSOP87 ephemeris via WASM
 * - Earth cloud layer (semi-transparent procedural clouds)
 * - Ring systems attached via RingRenderer
 * - Fallback to setTexture() for replacing procedural materials with texture maps
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Positions: heliocentric ecliptic J2000, converted from WASM (meters → AU).
 *
 * Sources:
 * - Planet radii: NASA Planetary Fact Sheets
 * - 1 AU = 149,597,870.7 km (IAU 2012 exact)
 */

import {
	SphereGeometry,
	Mesh,
	MeshStandardMaterial,
	MathUtils,
	TextureLoader,
	Color,
	Vector3,
	Quaternion
} from 'three/webgpu';
import type { Scene, Texture, Material } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import { createPlanetMaterial, createEarthCloudMaterial } from './planet-materials';
import type { PlanetMaterialResult } from './planet-materials';
import type { SolarSystemBody } from '$lib/data/types';

/** Convert a JS Date to Julian Date. */
export function dateToJD(date: Date): number {
	return 2440587.5 + date.getTime() / 86_400_000;
}

/** Planet NAIF IDs (Mercury=1 through Neptune=8). */
const PLANET_NAIF_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Earth NAIF ID. */
const EARTH_NAIF = 3;

/**
 * Approximate planet colors for fallback materials.
 * Used when procedural TSL materials can't be created.
 */
const PLANET_COLORS: Record<number, number> = {
	1: 0x8c7e6d, // Mercury — gray-brown
	2: 0xe8cda0, // Venus — pale yellow
	3: 0x2255aa, // Earth — blue
	4: 0xc1440e, // Mars — red-orange
	5: 0xc8a56e, // Jupiter — tan/amber
	6: 0xe8d8a0, // Saturn — pale gold
	7: 0x7ec8e3, // Uranus — blue-green
	8: 0x3355cc  // Neptune — deep blue
};

/**
 * Sphere segment counts by planet size class.
 * Gas giants get more segments for smoother appearance at closer range.
 */
function segmentsForPlanet(naifId: number): number {
	if (naifId >= 5 && naifId <= 8) return 48; // gas/ice giants
	return 32; // terrestrial
}

export interface PlanetRendererOptions {
	/**
	 * Size exaggeration factor applied to planet radii.
	 * At 1.0, planets are at true scale (invisible at solar-system zoom).
	 * @default 200
	 */
	sizeExaggeration?: number;

	/**
	 * WASM module with get_body_position(body_id, jd) → Float64Array.
	 * If not provided, planets are placed at origin until setWasm() is called.
	 */
	wasm?: WasmEphemeris;

	/**
	 * Whether to use procedural TSL node materials instead of flat colors.
	 * @default true
	 */
	proceduralMaterials?: boolean;

	/**
	 * Whether to render Earth's cloud layer.
	 * @default true
	 */
	earthClouds?: boolean;

}

import type { FramePositionCache } from './frame-position-cache';

/** Minimal interface for the WASM ephemeris functions we need. */
export interface WasmEphemeris {
	get_body_position(body_id: number, julian_date: number): Float64Array;
}

/** Runtime state for a single planet. */
interface PlanetState {
	naifId: number;
	body: SolarSystemBody;
	mesh: Mesh;
	geometry: SphereGeometry;
	material: Material;
	/** Current rotation angle in radians (accumulated over frames). */
	rotationAngle: number;
	/** Radians per second of sidereal rotation. */
	rotationRate: number;
}

/** Earth cloud layer state (if enabled). */
interface CloudLayerState {
	mesh: Mesh;
	geometry: SphereGeometry;
	material: Material;
}

const DEFAULTS: Required<Omit<PlanetRendererOptions, 'wasm'>> = {
	sizeExaggeration: 200,
	proceduralMaterials: true,
	earthClouds: true
};

/**
 * Manages rendering of all 8 planets in the near scene,
 * plus Earth's cloud layer and Moon.
 *
 * Usage:
 * ```ts
 * const planets = new PlanetRenderer(catalog.bodies, { wasm });
 * planets.addTo(scene);
 * // In frame loop:
 * planets.update(delta, currentJD);
 * ```
 */
export class PlanetRenderer {
	private planets: PlanetState[] = [];
	private wasm: WasmEphemeris | null;
	private sizeExaggeration: number;
	private textureLoader = new TextureLoader();
	private cloudLayer: CloudLayerState | null = null;
	private useProcedural: boolean;

	/** Sun direction uniform for Earth day/night shader, updated per frame. */
	private earthSunDirUniform: { value: Vector3 } | null = null;

	/** Reusable temporaries for sun direction computation. */
	private static readonly _tempVec = new Vector3();
	private static readonly _tempQuat = new Quaternion();

	constructor(bodies: SolarSystemBody[], options: PlanetRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.sizeExaggeration = options.sizeExaggeration ?? DEFAULTS.sizeExaggeration;
		this.useProcedural = options.proceduralMaterials ?? DEFAULTS.proceduralMaterials;
		const showClouds = options.earthClouds ?? DEFAULTS.earthClouds;

		for (const naifId of PLANET_NAIF_IDS) {
			const body = bodies.find((b) => b.naif_id === naifId);
			if (!body) continue;

			const segments = segmentsForPlanet(naifId);
			const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * this.sizeExaggeration;

			const geometry = new SphereGeometry(radiusAU, segments, segments);

			// Try procedural TSL material first, fall back to flat color
			let material: Material;
			if (this.useProcedural) {
				const result: PlanetMaterialResult | null = createPlanetMaterial(naifId);
				if (result) {
					material = result.material;
					// Store Earth's sun direction uniform for per-frame updates
					if (result.sunDirUniform) {
						this.earthSunDirUniform = result.sunDirUniform;
					}
				} else {
					material = new MeshStandardMaterial({
						color: new Color(PLANET_COLORS[naifId] ?? 0x888888),
						roughness: 0.8,
						metalness: 0.1
					});
				}
			} else {
				material = new MeshStandardMaterial({
					color: new Color(PLANET_COLORS[naifId] ?? 0x888888),
					roughness: 0.8,
					metalness: 0.1
				});
			}

			const mesh = new Mesh(geometry, material);

			// Apply axial tilt: rotate around Z axis (ecliptic north pole convention).
			const tiltRad = MathUtils.degToRad(body.axial_tilt_deg);
			mesh.rotation.order = 'ZYX';
			mesh.rotation.z = tiltRad;

			// Rotation rate: sidereal rotation period in hours → radians/second.
			const periodSeconds = body.rotation_period_hours * 3600;
			const rotationRate = periodSeconds !== 0 ? (2 * Math.PI) / periodSeconds : 0;

			this.planets.push({
				naifId,
				body,
				mesh,
				geometry,
				material,
				rotationAngle: 0,
				rotationRate
			});
		}

		// --- Earth cloud layer ---
		if (showClouds) {
			const earth = this.planets.find((p) => p.naifId === EARTH_NAIF);
			if (earth) {
				this.createCloudLayer(earth);
			}
		}

	}

	/**
	 * Create a semi-transparent cloud layer sphere around Earth.
	 * Slightly larger than the planet (1.5% bigger) to sit above the surface.
	 */
	private createCloudLayer(earth: PlanetState): void {
		const radiusAU = (earth.body.radius_km / (METERS_PER_AU / 1000)) * this.sizeExaggeration;
		const cloudRadius = radiusAU * 1.015;
		const geometry = new SphereGeometry(cloudRadius, 32, 32);
		// If we have a sun direction uniform, share it with the cloud material
		// so clouds also dim on the night side
		if (!this.earthSunDirUniform) {
			this.earthSunDirUniform = { value: new Vector3(1, 0, 0) };
		}
		const material = createEarthCloudMaterial(this.earthSunDirUniform);
		const mesh = new Mesh(geometry, material);

		// Cloud layer is a child of the Earth mesh — inherits position and tilt
		earth.mesh.add(mesh);

		this.cloudLayer = { mesh, geometry, material };
	}

	/** Provide or replace the WASM ephemeris module. */
	setWasm(wasm: WasmEphemeris): void {
		this.wasm = wasm;
	}

	/** Add all planet meshes to a scene. */
	addTo(scene: Scene): void {
		for (const p of this.planets) {
			scene.add(p.mesh);
		}
	}

	/** Remove all planet meshes from a scene. */
	removeFrom(scene: Scene): void {
		for (const p of this.planets) {
			scene.remove(p.mesh);
		}
	}

	/**
	 * Update planet positions and rotations. Call once per frame.
	 *
	 * @param delta Frame delta time in seconds
	 * @param jd Current Julian Date for ephemeris queries
	 * @param cache Optional batched position cache (avoids individual WASM calls)
	 */
	update(delta: number, jd: number, cache?: FramePositionCache): void {
		for (const p of this.planets) {
			// Update position — prefer batch cache, fall back to individual WASM call
			const cached = cache?.getBodyPositionAU(p.naifId);
			if (cached) {
				p.mesh.position.set(cached.x, cached.y, cached.z);
			} else if (this.wasm) {
				const pos = this.wasm.get_body_position(p.naifId, jd);
				p.mesh.position.set(
					pos[0] / METERS_PER_AU,
					pos[1] / METERS_PER_AU,
					pos[2] / METERS_PER_AU
				);
			}

			// Accumulate sidereal rotation around the (tilted) Y axis.
			p.rotationAngle += p.rotationRate * delta;
			p.mesh.rotation.y = p.rotationAngle;

			// Update Earth's sun direction uniform for day/night rendering.
			// Sun is at origin; direction from Earth to Sun = -position (normalized).
			// Transform into Earth-local space so the shader can compare with surface normals.
			if (p.naifId === EARTH_NAIF && this.earthSunDirUniform) {
				const tv = PlanetRenderer._tempVec;
				const tq = PlanetRenderer._tempQuat;

				// World-space direction from Earth toward the Sun (origin)
				tv.copy(p.mesh.position).negate().normalize();

				// Transform into Earth-local space by inverting the mesh's rotation
				tq.copy(p.mesh.quaternion).invert();
				tv.applyQuaternion(tq);

				this.earthSunDirUniform.value.copy(tv);
			}
		}

	}

	/**
	 * Set or change the size exaggeration factor.
	 * Rebuilds all sphere geometries at the new scale.
	 */
	setSizeExaggeration(factor: number): void {
		this.sizeExaggeration = factor;
		for (const p of this.planets) {
			const radiusAU = (p.body.radius_km / (METERS_PER_AU / 1000)) * factor;
			const segments = segmentsForPlanet(p.naifId);
			p.geometry.dispose();
			p.geometry = new SphereGeometry(radiusAU, segments, segments);
			p.mesh.geometry = p.geometry;
		}

		// Rebuild cloud layer
		if (this.cloudLayer) {
			const earth = this.planets.find((p) => p.naifId === EARTH_NAIF);
			if (earth) {
				this.cloudLayer.mesh.removeFromParent();
				this.cloudLayer.geometry.dispose();
				const radiusAU = (earth.body.radius_km / (METERS_PER_AU / 1000)) * factor;
				const cloudRadius = radiusAU * 1.015;
				this.cloudLayer.geometry = new SphereGeometry(cloudRadius, 32, 32);
				this.cloudLayer.mesh.geometry = this.cloudLayer.geometry;
				earth.mesh.add(this.cloudLayer.mesh);
			}
		}

	}

	/** Current size exaggeration factor. */
	get exaggeration(): number {
		return this.sizeExaggeration;
	}

	/**
	 * Load and apply a texture to a planet by NAIF ID.
	 * Replaces the procedural or placeholder color material.
	 */
	async setTexture(naifId: number, url: string): Promise<void> {
		const planet = this.planets.find((p) => p.naifId === naifId);
		if (!planet) return;

		const texture = await this.textureLoader.loadAsync(url);

		// Replace procedural material with a standard textured material
		if (!(planet.material instanceof MeshStandardMaterial)) {
			planet.material.dispose();
			planet.material = new MeshStandardMaterial({
				roughness: 0.8,
				metalness: 0.1
			});
			planet.mesh.material = planet.material;
		}

		(planet.material as MeshStandardMaterial).map = texture;
		(planet.material as MeshStandardMaterial).needsUpdate = true;
	}

	/** Apply an already-loaded texture to a planet. */
	applyTexture(naifId: number, texture: Texture): void {
		const planet = this.planets.find((p) => p.naifId === naifId);
		if (!planet) return;

		if (!(planet.material instanceof MeshStandardMaterial)) {
			planet.material.dispose();
			planet.material = new MeshStandardMaterial({
				roughness: 0.8,
				metalness: 0.1
			});
			planet.mesh.material = planet.material;
		}

		(planet.material as MeshStandardMaterial).map = texture;
		(planet.material as MeshStandardMaterial).needsUpdate = true;
	}

	/** Get a planet mesh by NAIF ID (for external positioning, camera targeting, etc.). */
	getMesh(naifId: number): Mesh | undefined {
		return this.planets.find((p) => p.naifId === naifId)?.mesh;
	}

	/** Get all planet meshes. */
	get meshes(): Mesh[] {
		return this.planets.map((p) => p.mesh);
	}

	/** Get all registered NAIF IDs. */
	get naifIds(): number[] {
		return this.planets.map((p) => p.naifId);
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const p of this.planets) {
			p.mesh.removeFromParent();
			p.geometry.dispose();
			if (p.material instanceof MeshStandardMaterial) {
				p.material.map?.dispose();
			}
			p.material.dispose();
		}
		this.planets.length = 0;

		if (this.cloudLayer) {
			this.cloudLayer.mesh.removeFromParent();
			this.cloudLayer.geometry.dispose();
			this.cloudLayer.material.dispose();
			this.cloudLayer = null;
		}
	}
}
