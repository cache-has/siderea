/**
 * Moon orbital path renderer.
 *
 * Renders orbital ellipses for major moons as fat anti-aliased lines,
 * positioned at the parent planet's heliocentric location.
 *
 * Uses WASM get_body_orbit_path() for Keplerian orbit computation (planet-centric).
 * For Earth's Moon (301), uses compute_orbit_path() with geocentric elements.
 * Paths are scaled with the same distance exaggeration as MoonRenderer.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 */

import { Line2NodeMaterial, Group } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import type { Scene, Mesh } from 'three/webgpu';
import { METERS_PER_AU } from './scale';

/** WASM interface for moon orbit path computation. */
export interface WasmMoonOrbitPath {
	/** Keplerian orbit path for a body. Returns flat [x0,y0,z0,...] in meters, parent-centric. */
	get_body_orbit_path(body_id: number, num_points: number): Float64Array;
	/** Generic orbit path from elements. */
	compute_orbit_path(elements: { a: number; e: number; i: number; raan: number; argp: number; mu: number }, num_points: number): Float64Array;
}

export interface MoonOrbitPathRendererOptions {
	/** Number of sample points per orbit path. @default 128 */
	pathResolution?: number;
	/** Line width in pixels. @default 0.8 */
	lineWidth?: number;
	/** Opacity of orbit lines. @default 0.25 */
	opacity?: number;
	/** Size exaggeration (same as MoonRenderer). @default 200 */
	sizeExaggeration?: number;
	/** Distance exaggeration (same as MoonRenderer). @default 0.5 */
	distanceExaggeration?: number;
	/** WASM module. */
	wasm?: WasmMoonOrbitPath;
}

/** Orbit line colors by moon NAIF ID. */
const MOON_ORBIT_COLORS: Record<number, number> = {
	301: 0x666666, // Moon — subtle gray
	401: 0x8b6d5b, // Phobos
	402: 0x8b6d5b, // Deimos
	501: 0xccaa44, // Io — yellow
	502: 0x8899bb, // Europa — blue-white
	503: 0x887766, // Ganymede — tan
	504: 0x666666, // Callisto — gray
	602: 0xaaaaaa, // Enceladus — white
	606: 0xbb8833, // Titan — orange
	705: 0x888888, // Miranda
	801: 0x998877, // Triton
	901: 0x777777  // Charon
};

/** Map moon NAIF ID to parent planet NAIF ID. */
function parentPlanetId(moonId: number): number {
	if (moonId === 301) return 3;
	return Math.floor(moonId / 100);
}

/** Per-orbit-path state. */
interface MoonOrbitState {
	moonId: number;
	parentId: number;
	line: Line2;
	geometry: LineGeometry;
	material: Line2NodeMaterial;
}

const DEFAULTS = {
	pathResolution: 128,
	lineWidth: 0.8,
	opacity: 0.25,
	sizeExaggeration: 200,
	distanceExaggeration: 0.5
};

/**
 * Renders orbital paths for major moons.
 *
 * Orbit paths are computed once (Keplerian) and stored as line geometry.
 * Each parent planet gets a Group that is repositioned each frame.
 */
export class MoonOrbitPathRenderer {
	private orbits: MoonOrbitState[] = [];
	private wasm: WasmMoonOrbitPath | null;
	private pathResolution: number;
	private lineWidth: number;
	private opacity: number;
	private sizeExaggeration: number;
	private distanceExaggeration: number;
	/** Groups indexed by parent NAIF ID. */
	private parentGroups = new Map<number, Group>();

	constructor(options: MoonOrbitPathRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.pathResolution = options.pathResolution ?? DEFAULTS.pathResolution;
		this.lineWidth = options.lineWidth ?? DEFAULTS.lineWidth;
		this.opacity = options.opacity ?? DEFAULTS.opacity;
		this.sizeExaggeration = options.sizeExaggeration ?? DEFAULTS.sizeExaggeration;
		this.distanceExaggeration = options.distanceExaggeration ?? DEFAULTS.distanceExaggeration;
	}

	/**
	 * Compute orbit paths for the given moon NAIF IDs.
	 */
	computeOrbits(moonIds: number[]): void {
		if (!this.wasm) {
			console.warn('[MoonOrbitPathRenderer] No WASM module');
			return;
		}

		this.disposeOrbits();

		const scale = this.sizeExaggeration * this.distanceExaggeration / METERS_PER_AU;

		for (const moonId of moonIds) {
			try {
				const posMeters = this.wasm.get_body_orbit_path(moonId, this.pathResolution);
				const pointCount = posMeters.length / 3;
				if (pointCount < 2) continue;

				// Convert meters → AU with distance exaggeration, close the loop
				const positions = new Float32Array((pointCount + 1) * 3);
				for (let i = 0; i < pointCount; i++) {
					positions[i * 3] = posMeters[i * 3] * scale;
					positions[i * 3 + 1] = posMeters[i * 3 + 1] * scale;
					positions[i * 3 + 2] = posMeters[i * 3 + 2] * scale;
				}
				// Close loop
				positions[pointCount * 3] = positions[0];
				positions[pointCount * 3 + 1] = positions[1];
				positions[pointCount * 3 + 2] = positions[2];

				const geometry = new LineGeometry();
				geometry.setPositions(positions);

				const material = new Line2NodeMaterial({
					color: MOON_ORBIT_COLORS[moonId] ?? 0x888888,
					linewidth: this.lineWidth,
					transparent: true,
					opacity: this.opacity,
					depthWrite: false
				});

				const line = new Line2(geometry, material);
				line.computeLineDistances();

				// Add to parent group
				const parentId = parentPlanetId(moonId);
				let group = this.parentGroups.get(parentId);
				if (!group) {
					group = new Group();
					this.parentGroups.set(parentId, group);
				}
				group.add(line);

				this.orbits.push({ moonId, parentId, line, geometry, material });
			} catch (err) {
				console.warn(`[MoonOrbitPathRenderer] Failed to compute orbit for moon ${moonId}:`, err);
			}
		}
	}

	/** Add all orbit path groups to a scene. */
	addTo(scene: Scene): void {
		for (const group of this.parentGroups.values()) {
			scene.add(group);
		}
	}

	/** Remove all orbit path groups from a scene. */
	removeFrom(scene: Scene): void {
		for (const group of this.parentGroups.values()) {
			scene.remove(group);
		}
	}

	/**
	 * Update parent group positions. Call each frame.
	 * @param getParentMesh Function to get parent planet mesh by NAIF ID
	 */
	update(getParentMesh: (naifId: number) => Mesh | undefined): void {
		for (const [parentId, group] of this.parentGroups) {
			const parentMesh = getParentMesh(parentId);
			if (parentMesh) {
				group.position.copy(parentMesh.position);
			}
		}
	}

	/** Set visibility of a specific moon orbit by NAIF ID. */
	setVisible(moonId: number, visible: boolean): void {
		const orbit = this.orbits.find((o) => o.moonId === moonId);
		if (orbit) orbit.line.visible = visible;
	}

	/** Set visibility of all moon orbits. */
	setAllVisible(visible: boolean): void {
		for (const o of this.orbits) {
			o.line.visible = visible;
		}
	}

	private disposeOrbits(): void {
		for (const o of this.orbits) {
			o.line.removeFromParent();
			o.geometry.dispose();
			o.material.dispose();
		}
		this.orbits.length = 0;
		for (const group of this.parentGroups.values()) {
			group.removeFromParent();
		}
		this.parentGroups.clear();
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		this.disposeOrbits();
	}
}
