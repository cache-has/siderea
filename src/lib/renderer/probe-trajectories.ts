/**
 * Trajectory renderer for deep-space probes (Voyagers, Pioneers, New Horizons).
 *
 * Renders open (non-periodic) trajectory paths as fat anti-aliased lines using
 * Three.js Line2. Trajectories are computed via linear propagation from each
 * probe's heliocentric epoch state vector — accurate for objects far from any
 * gravitational well on escape trajectories.
 *
 * Visual style:
 * - Past trajectory (epoch → now): solid line, full opacity
 * - Future trajectory (now → +N years): dashed line, reduced opacity
 * - Per-probe colors matching the gold/amber satellite sprite palette
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 */

import { Line2NodeMaterial } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import type { Scene } from 'three/webgpu';
import { float } from 'three/tsl';
import type { Satellite } from '$lib/data/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days per Julian year. */
const DAYS_PER_YEAR = 365.25;

/** Per-probe trajectory colors. Warm palette to match probe sprite color. */
const PROBE_COLORS: Record<string, number> = {
	voyager_1: 0xffcc44,     // gold
	voyager_2: 0xe8a030,     // amber
	pioneer_10: 0xccaa55,    // warm yellow
	pioneer_11: 0xbb9944,    // dark gold
	new_horizons: 0xddbb66   // pale gold
};

const DEFAULT_COLOR = 0xccaa44;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ProbeTrajectoryRendererOptions {
	/**
	 * Number of sample points for the past segment of the trajectory.
	 * @default 200
	 */
	pastPoints?: number;

	/**
	 * Number of sample points for the future segment.
	 * @default 100
	 */
	futurePoints?: number;

	/**
	 * How many years into the past to render from the epoch.
	 * The past trajectory starts at max(launchDate, epoch - pastYears).
	 * @default 50
	 */
	pastYears?: number;

	/**
	 * How many years into the future to render from the current JD.
	 * @default 20
	 */
	futureYears?: number;

	/**
	 * Line width in pixels for past (solid) trajectory.
	 * @default 1.5
	 */
	lineWidth?: number;

	/**
	 * Base opacity for past trajectory.
	 * @default 0.5
	 */
	pastOpacity?: number;

	/**
	 * Base opacity for future trajectory.
	 * @default 0.25
	 */
	futureOpacity?: number;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface TrajectoryState {
	probeId: string;
	pastLine: Line2;
	pastGeometry: LineGeometry;
	pastMaterial: Line2NodeMaterial;
	futureLine: Line2;
	futureGeometry: LineGeometry;
	futureMaterial: Line2NodeMaterial;
}

const DEFAULTS = {
	pastPoints: 200,
	futurePoints: 100,
	pastYears: 50,
	futureYears: 20,
	lineWidth: 1.5,
	pastOpacity: 0.5,
	futureOpacity: 0.25
};

// ---------------------------------------------------------------------------
// ProbeTrajectoryRenderer
// ---------------------------------------------------------------------------

/**
 * Renders open trajectory paths for deep-space probes.
 *
 * Usage:
 * ```ts
 * const trajectories = new ProbeTrajectoryRenderer(probes);
 * trajectories.computeTrajectories(currentJD);
 * trajectories.addTo(scene);
 * ```
 */
export class ProbeTrajectoryRenderer {
	private probes: Satellite[];
	private trajectories: TrajectoryState[] = [];
	private pastPoints: number;
	private futurePoints: number;
	private pastYears: number;
	private futureYears: number;
	private lineWidth: number;
	private pastOpacity: number;
	private futureOpacity: number;

	constructor(probes: Satellite[], options: ProbeTrajectoryRendererOptions = {}) {
		// Filter to only heliocentric probes with state vectors
		this.probes = probes.filter(
			(s) => s.subtype === 'probe' && s.orbit_type === 'heliocentric' && s.heliocentric_state
		);
		this.pastPoints = options.pastPoints ?? DEFAULTS.pastPoints;
		this.futurePoints = options.futurePoints ?? DEFAULTS.futurePoints;
		this.pastYears = options.pastYears ?? DEFAULTS.pastYears;
		this.futureYears = options.futureYears ?? DEFAULTS.futureYears;
		this.lineWidth = options.lineWidth ?? DEFAULTS.lineWidth;
		this.pastOpacity = options.pastOpacity ?? DEFAULTS.pastOpacity;
		this.futureOpacity = options.futureOpacity ?? DEFAULTS.futureOpacity;
	}

	/**
	 * Compute trajectory line geometry for all probes.
	 *
	 * Each probe gets two Line2 segments:
	 * - Past: from launch (or epoch - pastYears) to currentJD — solid
	 * - Future: from currentJD to currentJD + futureYears — dashed
	 *
	 * @param jd Current Julian Date
	 */
	computeTrajectories(jd: number): void {
		this.disposeTrajectories();

		for (const probe of this.probes) {
			const state = probe.heliocentric_state!;
			const epochJd = isoToJD(state.epoch);

			// Determine the time range for past trajectory
			const launchJd = isoToJD(probe.launch_date);
			const earliestJd = Math.max(launchJd, epochJd - this.pastYears * DAYS_PER_YEAR);
			const latestJd = jd + this.futureYears * DAYS_PER_YEAR;

			const color = PROBE_COLORS[probe.id] ?? DEFAULT_COLOR;

			// --- Past segment (earliestJd → jd) ---
			const pastPositions = this.propagateSegment(state, epochJd, earliestJd, jd, this.pastPoints);
			const pastGeometry = new LineGeometry();
			pastGeometry.setPositions(pastPositions);

			const pastMaterial = new Line2NodeMaterial({
				color,
				linewidth: this.lineWidth,
				transparent: true,
				opacity: this.pastOpacity,
				depthWrite: false,
				dashed: false
			});

			const pastLine = new Line2(pastGeometry, pastMaterial);
			pastLine.computeLineDistances();

			// --- Future segment (jd → latestJd) ---
			const futurePositions = this.propagateSegment(state, epochJd, jd, latestJd, this.futurePoints);
			const futureGeometry = new LineGeometry();
			futureGeometry.setPositions(futurePositions);

			const futureMaterial = new Line2NodeMaterial({
				color,
				linewidth: this.lineWidth * 0.7,
				transparent: true,
				opacity: this.futureOpacity,
				depthWrite: false,
				dashed: true
			});
			futureMaterial.dashSizeNode = float(0.8);
			futureMaterial.gapSizeNode = float(0.4);
			futureMaterial.dashScaleNode = float(1.0);

			const futureLine = new Line2(futureGeometry, futureMaterial);
			futureLine.computeLineDistances();

			this.trajectories.push({
				probeId: probe.id,
				pastLine,
				pastGeometry,
				pastMaterial,
				futureLine,
				futureGeometry,
				futureMaterial
			});
		}
	}

	/**
	 * Propagate a probe's state vector over a time range via linear extrapolation.
	 * Returns a flat Float32Array of [x,y,z, x,y,z, ...] positions in AU.
	 */
	private propagateSegment(
		state: { x_au: number; y_au: number; z_au: number; vx_au_day: number; vy_au_day: number; vz_au_day: number },
		epochJd: number,
		startJd: number,
		endJd: number,
		numPoints: number
	): Float32Array {
		const positions = new Float32Array(numPoints * 3);
		const span = endJd - startJd;

		for (let i = 0; i < numPoints; i++) {
			const t = startJd + (i / (numPoints - 1)) * span;
			const dt = t - epochJd;
			positions[i * 3] = state.x_au + state.vx_au_day * dt;
			positions[i * 3 + 1] = state.y_au + state.vy_au_day * dt;
			positions[i * 3 + 2] = state.z_au + state.vz_au_day * dt;
		}

		return positions;
	}

	/** Add all trajectory lines to a scene. */
	addTo(scene: Scene): void {
		for (const t of this.trajectories) {
			scene.add(t.pastLine);
			scene.add(t.futureLine);
		}
	}

	/** Remove all trajectory lines from a scene. */
	removeFrom(scene: Scene): void {
		for (const t of this.trajectories) {
			scene.remove(t.pastLine);
			scene.remove(t.futureLine);
		}
	}

	/** Set visibility of all trajectories. */
	setAllVisible(visible: boolean): void {
		for (const t of this.trajectories) {
			t.pastLine.visible = visible;
			t.futureLine.visible = visible;
		}
	}

	/** Set visibility of a specific probe's trajectory by ID. */
	setVisible(probeId: string, visible: boolean): void {
		const traj = this.trajectories.find((t) => t.probeId === probeId);
		if (traj) {
			traj.pastLine.visible = visible;
			traj.futureLine.visible = visible;
		}
	}

	/** Get trajectory Line2 objects for a probe (for raycasting etc). */
	getLines(probeId: string): { past: Line2; future: Line2 } | undefined {
		const traj = this.trajectories.find((t) => t.probeId === probeId);
		if (!traj) return undefined;
		return { past: traj.pastLine, future: traj.futureLine };
	}

	private disposeTrajectories(): void {
		for (const t of this.trajectories) {
			t.pastLine.removeFromParent();
			t.futureLine.removeFromParent();
			t.pastGeometry.dispose();
			t.futureGeometry.dispose();
			t.pastMaterial.dispose();
			t.futureMaterial.dispose();
		}
		this.trajectories.length = 0;
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		this.disposeTrajectories();
	}
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Convert an ISO 8601 date string to Julian Date. */
function isoToJD(iso: string): number {
	const date = new Date(iso);
	return 2440587.5 + date.getTime() / 86_400_000;
}
