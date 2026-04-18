/**
 * Comet renderer for the near (solar system) scene.
 *
 * Renders notable comets with:
 * - Nucleus mesh (small sphere with icy material)
 * - Coma glow (billboard sprite around nucleus)
 * - Tail pointing away from the Sun (simplified anti-sunward direction)
 * - Per-frame position updates from Keplerian ephemeris via WASM
 *
 * Supported comets (NAIF IDs 1001–1006):
 * - 1P/Halley, Hale-Bopp, NEOWISE, 2P/Encke, 55P/Tempel-Tuttle, 109P/Swift-Tuttle
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Positions: heliocentric ecliptic J2000, converted from WASM (meters → AU).
 */

import {
	SphereGeometry,
	Mesh,
	MeshStandardMaterial,
	SpriteMaterial,
	Sprite,
	BufferGeometry,
	LineBasicMaterial,
	Line,
	Float32BufferAttribute,
	Color,
	Vector3,
	AdditiveBlending
} from 'three/webgpu';
import type { Scene, Material } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';
import type { WasmEphemeris } from './planets';
import type { FramePositionCache } from './frame-position-cache';

/** Comet NAIF IDs. */
const COMET_NAIF_IDS = [1001, 1002, 1003, 1004, 1005, 1006] as const;

/** Approximate comet coma colors. */
const COMET_COLORS: Record<number, number> = {
	1001: 0xc8dde8, // Halley — icy blue-white
	1002: 0xe8e0c8, // Hale-Bopp — warm white (very bright)
	1003: 0xd0e0d8, // NEOWISE — green-white
	1004: 0xb8c8d0, // Encke — faint blue-gray
	1005: 0xc0d0e0, // Tempel-Tuttle — blue-white
	1006: 0xd8d0c0  // Swift-Tuttle — warm white
};

/** Tail color (ion tail is typically blue, dust tail is white-yellow). */
const TAIL_COLOR = 0x8888cc;

export interface CometRendererOptions {
	/**
	 * Size exaggeration factor for nucleus radius.
	 * Comets are tiny — need more exaggeration than planets.
	 * @default 800
	 */
	sizeExaggeration?: number;

	/**
	 * Scale factor for coma glow sprite size relative to nucleus.
	 * @default 40
	 */
	comaScale?: number;

	/**
	 * Length of tail in AU (visual, not physical).
	 * @default 0.15
	 */
	tailLength?: number;

	/**
	 * WASM module with get_body_position(body_id, jd) -> Float64Array.
	 */
	wasm?: WasmEphemeris;
}

/** Runtime state for a single comet. */
interface CometState {
	naifId: number;
	body: SolarSystemBody;
	nucleus: Mesh;
	nucleusGeometry: SphereGeometry;
	nucleusMaterial: Material;
	coma: Sprite;
	comaMaterial: SpriteMaterial;
	tail: Line;
	tailGeometry: BufferGeometry;
	tailMaterial: LineBasicMaterial;
}

const DEFAULTS = {
	sizeExaggeration: 800,
	comaScale: 40,
	tailLength: 0.15
};

/**
 * Manages rendering of notable comets in the near scene.
 *
 * Usage:
 * ```ts
 * const comets = new CometRenderer(bodies, { wasm });
 * comets.addTo(scene);
 * // In frame loop:
 * comets.update(delta, currentJD);
 * ```
 */
export class CometRenderer {
	private comets: CometState[] = [];
	private wasm: WasmEphemeris | null;
	private sizeExaggeration: number;
	private comaScale: number;
	private tailLength: number;

	constructor(bodies: SolarSystemBody[], options: CometRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.sizeExaggeration = options.sizeExaggeration ?? DEFAULTS.sizeExaggeration;
		this.comaScale = options.comaScale ?? DEFAULTS.comaScale;
		this.tailLength = options.tailLength ?? DEFAULTS.tailLength;

		for (const naifId of COMET_NAIF_IDS) {
			const body = bodies.find((b) => b.naif_id === naifId);
			if (!body) continue;

			// --- Nucleus ---
			const segments = 16; // Comets are small, low detail is fine
			const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * this.sizeExaggeration;

			const nucleusGeometry = new SphereGeometry(radiusAU, segments, segments);
			const nucleusMaterial = new MeshStandardMaterial({
				color: new Color(0x444444), // Dark, icy
				roughness: 0.95,
				metalness: 0.0,
				emissive: new Color(COMET_COLORS[naifId] ?? 0xaaaaaa),
				emissiveIntensity: 0.3
			});
			const nucleus = new Mesh(nucleusGeometry, nucleusMaterial);

			// --- Coma glow (billboard sprite) ---
			const comaMaterial = new SpriteMaterial({
				color: new Color(COMET_COLORS[naifId] ?? 0xcccccc),
				transparent: true,
				opacity: 0.4,
				blending: AdditiveBlending,
				depthWrite: false
			});
			const coma = new Sprite(comaMaterial);
			const comaSize = radiusAU * this.comaScale;
			coma.scale.set(comaSize, comaSize, 1);

			// --- Tail (simple line away from Sun) ---
			const tailGeometry = new BufferGeometry();
			const tailPositions = new Float32Array(6); // 2 points × 3 components
			tailGeometry.setAttribute('position', new Float32BufferAttribute(tailPositions, 3));

			const tailMaterial = new LineBasicMaterial({
				color: TAIL_COLOR,
				transparent: true,
				opacity: 0.35,
				depthWrite: false
			});
			const tail = new Line(tailGeometry, tailMaterial);

			this.comets.push({
				naifId,
				body,
				nucleus,
				nucleusGeometry,
				nucleusMaterial,
				coma,
				comaMaterial,
				tail,
				tailGeometry,
				tailMaterial
			});
		}
	}

	/** Provide or replace the WASM ephemeris module. */
	setWasm(wasm: WasmEphemeris): void {
		this.wasm = wasm;
	}

	/** Add all comet objects to a scene. */
	addTo(scene: Scene): void {
		for (const c of this.comets) {
			scene.add(c.nucleus);
			scene.add(c.coma);
			scene.add(c.tail);
		}
	}

	/** Remove all comet objects from a scene. */
	removeFrom(scene: Scene): void {
		for (const c of this.comets) {
			scene.remove(c.nucleus);
			scene.remove(c.coma);
			scene.remove(c.tail);
		}
	}

	/**
	 * Update comet positions and tails. Call once per frame.
	 *
	 * @param _delta Frame delta time in seconds (unused, comets don't visibly rotate)
	 * @param jd Current Julian Date for ephemeris queries
	 * @param cache Optional batched position cache
	 */
	update(_delta: number, jd: number, cache?: FramePositionCache): void {
		const sunPos = new Vector3(0, 0, 0);

		for (const c of this.comets) {
			let x: number, y: number, z: number;
			const cached = cache?.getBodyPositionAU(c.naifId);
			if (cached) {
				x = cached.x;
				y = cached.y;
				z = cached.z;
			} else if (this.wasm) {
				const pos = this.wasm.get_body_position(c.naifId, jd);
				x = pos[0] / METERS_PER_AU;
				y = pos[1] / METERS_PER_AU;
				z = pos[2] / METERS_PER_AU;
			} else {
				continue;
			}

			c.nucleus.position.set(x, y, z);
			c.coma.position.set(x, y, z);

			// Tail: points away from the Sun (anti-sunward)
			const cometPos = new Vector3(x, y, z);
			const antiSunDir = cometPos.clone().sub(sunPos).normalize();
			const tailEnd = cometPos.clone().add(antiSunDir.multiplyScalar(this.tailLength));

			const positions = c.tailGeometry.getAttribute('position') as Float32BufferAttribute;
			positions.setXYZ(0, x, y, z);
			positions.setXYZ(1, tailEnd.x, tailEnd.y, tailEnd.z);
			positions.needsUpdate = true;

			// Scale tail opacity by distance from sun (brighter when closer)
			const distAU = cometPos.length();
			const tailOpacity = Math.min(0.6, 1.0 / (distAU * 0.5 + 0.5));
			c.tailMaterial.opacity = tailOpacity;

			// Scale coma opacity similarly
			const comaOpacity = Math.min(0.5, 0.8 / (distAU * 0.3 + 0.5));
			c.comaMaterial.opacity = comaOpacity;
		}
	}

	/** Get a comet nucleus mesh by NAIF ID. */
	getMesh(naifId: number): Mesh | undefined {
		return this.comets.find((c) => c.naifId === naifId)?.nucleus;
	}

	/** Get all comet nucleus meshes. */
	get meshes(): Mesh[] {
		return this.comets.map((c) => c.nucleus);
	}

	/** Get all comet NAIF IDs being rendered. */
	get naifIds(): number[] {
		return this.comets.map((c) => c.naifId);
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const c of this.comets) {
			c.nucleus.removeFromParent();
			c.coma.removeFromParent();
			c.tail.removeFromParent();
			c.nucleusGeometry.dispose();
			c.nucleusMaterial.dispose();
			c.comaMaterial.dispose();
			c.tailGeometry.dispose();
			c.tailMaterial.dispose();
		}
		this.comets.length = 0;
	}
}
