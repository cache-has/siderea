/**
 * Orbital path renderer for the near (solar system) scene.
 *
 * Renders orbital ellipses for planets (and potentially other bodies) as
 * smooth anti-aliased lines using Three.js Line2 (WebGPU fat lines).
 *
 * Orbit paths are computed once from the WASM ephemeris and cached as
 * line geometry. They only need recomputation if the time range or
 * body changes.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Source data: WASM get_planet_orbit_path() returns meters, J2000 ecliptic.
 */

import { Line, BufferGeometry, LineBasicNodeMaterial, Float32BufferAttribute } from 'three/webgpu';
import type { Scene } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { METERS_PER_AU } from './scale';

/** Minimal interface for WASM orbit path functions. */
export interface WasmOrbitPath {
	/**
	 * Compute VSOP87 positions for a planet over a time range.
	 * Returns flat Float64Array [x0,y0,z0, x1,y1,z1, ...] in meters.
	 */
	get_planet_orbit_path(
		body_id: number,
		jd_start: number,
		jd_end: number,
		steps: number
	): Float64Array;

	/**
	 * Compute a full Keplerian orbit path for any registered body.
	 * Returns flat Float64Array [x0,y0,z0, x1,y1,z1, ...] in meters (heliocentric).
	 */
	get_body_orbit_path(body_id: number, num_points: number): Float64Array;
}

/** Per-orbit colors by NAIF ID. Subtle, distinguishable palette. */
const ORBIT_COLORS: Record<number, number> = {
	1: 0x8c7e6d, // Mercury — gray-brown
	2: 0xe8cda0, // Venus — pale yellow
	3: 0x4488cc, // Earth — blue
	4: 0xcc5533, // Mars — red-orange
	5: 0xc8a56e, // Jupiter — tan
	6: 0xd4c080, // Saturn — gold
	7: 0x6ab0cc, // Uranus — cyan
	8: 0x3366aa, // Neptune — deep blue
	9: 0x9b8878,  // Pluto — pale tan
	10: 0x6a6a6a, // Ceres — gray
	11: 0xababab, // Eris — light gray
	12: 0x8a7a6a, // Haumea — brown
	13: 0x9a7a60, // Makemake — reddish-brown
	// Comets
	1001: 0x6688aa, // Halley — blue-white
	1002: 0x8888aa, // Hale-Bopp — warm blue
	1003: 0x6a8a7a, // NEOWISE — green-tinted
	1004: 0x7a8a9a, // Encke — pale blue
	1005: 0x6a7a8a, // Tempel-Tuttle — blue
	1006: 0x8a7a6a, // Swift-Tuttle — warm
	// Notable asteroids
	2001: 0x8a8070, // Vesta — warm gray
	2002: 0x7a7a7a, // Pallas — neutral gray
	2003: 0x606058, // Hygiea — dark gray (C-type)
	// Notable KBOs
	3001: 0x7a8090, // Quaoar — cool gray
	3002: 0xaa6050, // Sedna — reddish (one of reddest TNOs)
	3003: 0x808888  // Orcus — blue-gray (water ice)
};

export interface OrbitPathRendererOptions {
	/**
	 * Number of sample points per orbit path.
	 * Higher = smoother but more geometry.
	 * @default 256
	 */
	pathResolution?: number;

	/**
	 * Line width in pixels.
	 * @default 1.2
	 */
	lineWidth?: number;

	/**
	 * Opacity of orbit lines.
	 * @default 0.4
	 */
	opacity?: number;

	/**
	 * Enable distance-based fade from body's current position.
	 * The orbit fades from full opacity near the body to fadeMin at the opposite side.
	 * @default true
	 */
	fadeEnabled?: boolean;

	/**
	 * Minimum opacity at the point farthest from body (as fraction of base opacity).
	 * @default 0.15
	 */
	fadeMin?: number;

	/** WASM module. Required for orbit computation. */
	wasm?: WasmOrbitPath;
}

/** Runtime state for a single orbit path. */
interface OrbitState {
	naifId: number;
	line: Line;
	geometry: BufferGeometry;
	material: LineBasicNodeMaterial;
	/** Total cumulative line distance (from computeLineDistances). */
	totalDistance: number;
	/** Uniform: distance along orbit where body currently is. */
	bodyDistanceUniform: { value: any };
	/** Uniform: total orbit distance for normalization. */
	totalDistanceUniform: { value: any };
}

const PLANET_NAIF_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const DEFAULTS = {
	pathResolution: 256,
	lineWidth: 1.2,
	opacity: 0.4,
	fadeEnabled: false,
	fadeMin: 0.15
};

/**
 * Renders orbital paths for all 8 planets as fat anti-aliased lines.
 *
 * Usage:
 * ```ts
 * const orbits = new OrbitPathRenderer({ wasm });
 * orbits.computeOrbits(currentJD); // one-time computation
 * orbits.addTo(scene);
 * ```
 */
export class OrbitPathRenderer {
	private orbits: OrbitState[] = [];
	private wasm: WasmOrbitPath | null;
	private pathResolution: number;
	private lineWidth: number;
	private opacity: number;
	private fadeEnabled: boolean;
	private fadeMin: number;

	constructor(options: OrbitPathRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.pathResolution = options.pathResolution ?? DEFAULTS.pathResolution;
		this.lineWidth = options.lineWidth ?? DEFAULTS.lineWidth;
		this.opacity = options.opacity ?? DEFAULTS.opacity;
		this.fadeEnabled = options.fadeEnabled ?? DEFAULTS.fadeEnabled;
		this.fadeMin = options.fadeMin ?? DEFAULTS.fadeMin;
	}

	/** Provide or replace the WASM module. */
	setWasm(wasm: WasmOrbitPath): void {
		this.wasm = wasm;
	}

	/**
	 * Create a Line2NodeMaterial with optional distance-based fade.
	 *
	 * When fade is enabled, dashed mode is activated (with invisible dashes)
	 * to get access to the lineDistance varying. Opacity fades from full at the
	 * body's current position to fadeMin at the opposite side of the orbit.
	 */
	private createOrbitMaterial(
		color: number,
		_linewidth: number,
		baseOpacity: number
	): LineBasicNodeMaterial {
		return new LineBasicNodeMaterial({
			color,
			transparent: true,
			depthWrite: true,
			opacity: baseOpacity
		});
	}

/**
	 * Compute and build orbit path geometry for all planets.
	 *
	 * Each planet's orbit is sampled over one full orbital period centered
	 * on the given Julian Date. The path is closed by appending the first
	 * point at the end.
	 *
	 * @param jd Center Julian Date for the orbit time range
	 * @param orbitalPeriods Map of NAIF ID → orbital period in days (from registry)
	 */
	computeOrbits(
		jd: number,
		orbitalPeriods: Map<number, number>
	): void {
		if (!this.wasm) {
			console.warn('[OrbitPathRenderer] No WASM module — cannot compute orbits');
			return;
		}

		// Dispose any existing orbits
		this.disposeOrbits();

		for (const naifId of PLANET_NAIF_IDS) {
			const period = orbitalPeriods.get(naifId);
			if (!period) continue;

			// Sample one full orbit centered on the current date
			const halfPeriod = period / 2;
			const jdStart = jd - halfPeriod;
			const jdEnd = jd + halfPeriod;

			const posMeters = this.wasm.get_planet_orbit_path(
				naifId,
				jdStart,
				jdEnd,
				this.pathResolution
			);

			// Convert meters → AU and build position array for LineGeometry
			// LineGeometry.setPositions expects a flat Float32Array or number[]
			const pointCount = posMeters.length / 3;
			// +1 for closing the loop
			const positions = new Float32Array((pointCount + 1) * 3);

			for (let i = 0; i < pointCount; i++) {
				positions[i * 3] = posMeters[i * 3] / METERS_PER_AU;
				positions[i * 3 + 1] = posMeters[i * 3 + 1] / METERS_PER_AU;
				positions[i * 3 + 2] = posMeters[i * 3 + 2] / METERS_PER_AU;
			}

			// Close the loop: append the first point
			positions[pointCount * 3] = positions[0];
			positions[pointCount * 3 + 1] = positions[1];
			positions[pointCount * 3 + 2] = positions[2];

			const geometry = new BufferGeometry();
			geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

const material = this.createOrbitMaterial(
				ORBIT_COLORS[naifId] ?? 0x888888,
				this.lineWidth,
				this.opacity
			);

			const line = new Line(geometry, material);

			this.orbits.push({ naifId, line, geometry, material, totalDistance: 0, bodyDistanceUniform: uniform(0), totalDistanceUniform: uniform(1) });
		}
	}

	/**
	 * Compute and build orbit path geometry for dwarf planets using Keplerian propagation.
	 *
	 * Unlike planets (VSOP87), dwarf planet orbits are computed from a single set
	 * of Keplerian elements propagated over one full period. The WASM function
	 * handles the full orbit internally.
	 *
	 * @param naifIds Dwarf planet NAIF IDs to compute orbits for (9-13)
	 */
	computeDwarfOrbits(naifIds: number[]): void {
		if (!this.wasm) {
			console.warn('[OrbitPathRenderer] No WASM module — cannot compute dwarf orbits');
			return;
		}

		for (const naifId of naifIds) {
			try {
				const posMeters = this.wasm.get_body_orbit_path(naifId, this.pathResolution);
				const pointCount = posMeters.length / 3;
				if (pointCount < 2) continue;

				// Convert meters -> AU and close the loop
				const positions = new Float32Array((pointCount + 1) * 3);
				for (let i = 0; i < pointCount; i++) {
					positions[i * 3] = posMeters[i * 3] / METERS_PER_AU;
					positions[i * 3 + 1] = posMeters[i * 3 + 1] / METERS_PER_AU;
					positions[i * 3 + 2] = posMeters[i * 3 + 2] / METERS_PER_AU;
				}
				positions[pointCount * 3] = positions[0];
				positions[pointCount * 3 + 1] = positions[1];
				positions[pointCount * 3 + 2] = positions[2];

				const geometry = new BufferGeometry();
				geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

				const bodyDistUniform = uniform(0);
				const totalDistUniform = uniform(1);

				const material = this.createOrbitMaterial(
					ORBIT_COLORS[naifId] ?? 0x888888,
					this.lineWidth,
					this.opacity * 0.7
				);

				const line = new Line(geometry, material);

				this.orbits.push({ naifId, line, geometry, material, totalDistance: 0, bodyDistanceUniform: bodyDistUniform, totalDistanceUniform: totalDistUniform });
			} catch (err) {
				console.warn(`[OrbitPathRenderer] Failed to compute orbit for dwarf planet ${naifId}:`, err);
			}
		}
	}

	/**
	 * Compute and build orbit path geometry for comets using Keplerian propagation.
	 *
	 * Comet orbits are highly eccentric ellipses. Uses the same WASM function as
	 * dwarf planets but with higher point counts for smoother rendering of the
	 * elongated paths.
	 *
	 * @param naifIds Comet NAIF IDs to compute orbits for (1001-1006)
	 */
	computeCometOrbits(naifIds: number[]): void {
		if (!this.wasm) {
			console.warn('[OrbitPathRenderer] No WASM module — cannot compute comet orbits');
			return;
		}

		// Use more points for highly eccentric orbits to capture the tight perihelion curve
		const cometResolution = Math.max(this.pathResolution, 512);

		for (const naifId of naifIds) {
			try {
				const posMeters = this.wasm.get_body_orbit_path(naifId, cometResolution);
				const pointCount = posMeters.length / 3;
				if (pointCount < 2) continue;

				// Convert meters -> AU and close the loop
				const positions = new Float32Array((pointCount + 1) * 3);
				for (let i = 0; i < pointCount; i++) {
					positions[i * 3] = posMeters[i * 3] / METERS_PER_AU;
					positions[i * 3 + 1] = posMeters[i * 3 + 1] / METERS_PER_AU;
					positions[i * 3 + 2] = posMeters[i * 3 + 2] / METERS_PER_AU;
				}
				positions[pointCount * 3] = positions[0];
				positions[pointCount * 3 + 1] = positions[1];
				positions[pointCount * 3 + 2] = positions[2];

				const geometry = new BufferGeometry();
				geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

				const bodyDistUniform = uniform(0);
				const totalDistUniform = uniform(1);

				const material = this.createOrbitMaterial(
					ORBIT_COLORS[naifId] ?? 0x6688aa,
					this.lineWidth * 0.8,
					this.opacity * 0.5
				);

				const line = new Line(geometry, material);

				this.orbits.push({ naifId, line, geometry, material, totalDistance: 0, bodyDistanceUniform: bodyDistUniform, totalDistanceUniform: totalDistUniform });
			} catch (err) {
				console.warn(`[OrbitPathRenderer] Failed to compute orbit for comet ${naifId}:`, err);
			}
		}
	}

	/**
	 * Compute and build orbit path geometry for notable small bodies
	 * (asteroids and KBOs) using Keplerian propagation.
	 *
	 * @param naifIds Small body NAIF IDs (2001-2003, 3001-3003)
	 */
	computeSmallBodyOrbits(naifIds: number[]): void {
		if (!this.wasm) {
			console.warn('[OrbitPathRenderer] No WASM module — cannot compute small body orbits');
			return;
		}

		for (const naifId of naifIds) {
			try {
				const posMeters = this.wasm.get_body_orbit_path(naifId, this.pathResolution);
				const pointCount = posMeters.length / 3;
				if (pointCount < 2) continue;

				// Convert meters -> AU and close the loop
				const positions = new Float32Array((pointCount + 1) * 3);
				for (let i = 0; i < pointCount; i++) {
					positions[i * 3] = posMeters[i * 3] / METERS_PER_AU;
					positions[i * 3 + 1] = posMeters[i * 3 + 1] / METERS_PER_AU;
					positions[i * 3 + 2] = posMeters[i * 3 + 2] / METERS_PER_AU;
				}
				positions[pointCount * 3] = positions[0];
				positions[pointCount * 3 + 1] = positions[1];
				positions[pointCount * 3 + 2] = positions[2];

				const geometry = new BufferGeometry();
				geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

				const bodyDistUniform = uniform(0);
				const totalDistUniform = uniform(1);

				const material = this.createOrbitMaterial(
					ORBIT_COLORS[naifId] ?? 0x888888,
					this.lineWidth * 0.8,
					this.opacity * 0.5
				);

				const line = new Line(geometry, material);

				this.orbits.push({ naifId, line, geometry, material, totalDistance: 0, bodyDistanceUniform: bodyDistUniform, totalDistanceUniform: totalDistUniform });
			} catch (err) {
				console.warn(`[OrbitPathRenderer] Failed to compute orbit for small body ${naifId}:`, err);
			}
		}
	}

	/**
	 * Update the body progress along its orbit for fade effects.
	 *
	 * Finds the closest point on the orbit to the body's current world position
	 * and sets the bodyDistance uniform accordingly.
	 *
	 * @param naifId Body NAIF ID
	 * @param bodyX Body X position in AU (near scene coords)
	 * @param bodyY Body Y position in AU
	 * @param bodyZ Body Z position in AU
	 */
	updateBodyProgress(naifId: number, bodyX: number, bodyY: number, bodyZ: number): void {
		const orbit = this.orbits.find((o) => o.naifId === naifId);
		if (!orbit || !this.fadeEnabled) return;

		// Find the closest segment to the body position by walking the line geometry positions
		const posAttr = orbit.geometry.getAttribute('instanceStart');
		const distEnd = orbit.geometry.getAttribute('instanceDistanceEnd');
		const distStart = orbit.geometry.getAttribute('instanceDistanceStart');
		if (!posAttr || !distEnd || !distStart) return;

		let bestDist = Infinity;
		let bestLineDist = 0;

		for (let i = 0; i < posAttr.count; i++) {
			const px = posAttr.getX(i);
			const py = posAttr.getY(i);
			const pz = posAttr.getZ(i);
			const dx = px - bodyX;
			const dy = py - bodyY;
			const dz = pz - bodyZ;
			const d = dx * dx + dy * dy + dz * dz;
			if (d < bestDist) {
				bestDist = d;
				bestLineDist = distStart.getX(i);
			}
		}

		orbit.bodyDistanceUniform.value = bestLineDist;
	}

	/**
	 * Update body progress for all orbits using a mesh lookup function.
	 * Convenience method for frame loops — calls updateBodyProgress for every tracked orbit.
	 *
	 * @param getMesh Function to get a body's mesh by NAIF ID
	 */
	updateAllBodyProgress(getMesh: (naifId: number) => { position: { x: number; y: number; z: number } } | undefined): void {
		if (!this.fadeEnabled) return;
		for (const orbit of this.orbits) {
			const mesh = getMesh(orbit.naifId);
			if (mesh) {
				this.updateBodyProgress(orbit.naifId, mesh.position.x, mesh.position.y, mesh.position.z);
			}
		}
	}

	/**
	 * Enable or disable visible dashing for a specific orbit (e.g. for predicted/future orbits).
	 *
	 * @param naifId Body NAIF ID
	 * @param dashed Whether to show dashes
	 * @param dashSize Size of dash segments (in line distance units)
	 * @param gapSize Size of gaps between dashes
	 */
	setDashed(_naifId: number, _dashed: boolean, _dashSize = 0.1, _gapSize = 0.05): void {
		// TODO: implement dashing with LineDashedMaterial
	}

	/**
	 * Set all orbits matching a predicate to dashed or solid.
	 */
	setDashedWhere(predicate: (naifId: number) => boolean, dashed: boolean, dashSize = 0.1, gapSize = 0.05): void {
		for (const o of this.orbits) {
			if (predicate(o.naifId)) {
				this.setDashed(o.naifId, dashed, dashSize, gapSize);
			}
		}
	}

	/** Add all orbit paths to a scene. */
	addTo(scene: Scene): void {
		for (const o of this.orbits) {
			scene.add(o.line);
		}
	}

	/** Remove all orbit paths from a scene. */
	removeFrom(scene: Scene): void {
		for (const o of this.orbits) {
			scene.remove(o.line);
		}
	}

	/** Set visibility of a specific orbit by NAIF ID. */
	setVisible(naifId: number, visible: boolean): void {
		const orbit = this.orbits.find((o) => o.naifId === naifId);
		if (orbit) orbit.line.visible = visible;
	}

	/** Set visibility of all orbits. */
	setAllVisible(visible: boolean): void {
		for (const o of this.orbits) {
			o.line.visible = visible;
		}
	}

	/** Set visibility of orbits matching a NAIF ID predicate. */
	setVisibleWhere(predicate: (naifId: number) => boolean, visible: boolean): void {
		for (const o of this.orbits) {
			if (predicate(o.naifId)) o.line.visible = visible;
		}
	}

	/** Get an orbit Line by NAIF ID. */
	getLine(naifId: number): Line | undefined {
		return this.orbits.find((o) => o.naifId === naifId)?.line;
	}

	private disposeOrbits(): void {
		for (const o of this.orbits) {
			o.line.removeFromParent();
			o.geometry.dispose();
			o.material.dispose();
		}
		this.orbits.length = 0;
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		this.disposeOrbits();
	}
}
