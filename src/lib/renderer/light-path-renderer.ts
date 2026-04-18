/**
 * Light path renderer — visualizes photon paths with gravitational lensing.
 *
 * Draws a glowing line from a source celestial object to Earth (or any target),
 * showing how the path bends near massive bodies. Includes an animated photon
 * pulse traveling along the path and a dashed straight-line reference.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 * Source data: WASM compute_light_path() returns meters.
 */

import { Line2NodeMaterial } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import {
	SphereGeometry,
	Mesh,
	MeshBasicMaterial,
	Group,
	Vector3
} from 'three/webgpu';
import { float } from 'three/tsl';
import type { Scene } from 'three/webgpu';
import { METERS_PER_AU } from './scale';

/** Minimal WASM interface for light path computation. */
export interface WasmLightPath {
	compute_light_path(
		source: Float64Array,
		target: Float64Array,
		bodies: unknown,
		points_per_segment: number
	): LightPathWasmResult;

	compute_schwarzschild_geodesic(
		gm: number,
		impact_parameter: number,
		phi_range: number,
		num_steps: number
	): Float64Array;

	get_black_hole_geometry(gm: number): BlackHoleGeometryResult;
}

/** Result shape from WASM compute_light_path(). */
export interface LightPathWasmResult {
	points: number[];
	total_distance: number;
	travel_time: number;
	straight_line_distance: number;
	total_deflection: number;
	deflections: Array<{
		body_index: number;
		deflection_angle: number;
		closest_approach: number;
		numerical: boolean;
	}>;
}

/** Result shape from WASM get_black_hole_geometry(). */
export interface BlackHoleGeometryResult {
	schwarzschild_radius: number;
	photon_sphere_radius: number;
	isco_radius: number;
	critical_impact_parameter: number;
	shadow_radius: number;
}

/** Options for the light path renderer. */
export interface LightPathRendererOptions {
	lineWidth?: number;
	opacity?: number;
	color?: number;
	referenceLineColor?: number;
	pulseColor?: number;
	pulseSpeed?: number;
	wasm?: WasmLightPath;
}

/** Internal state for a single rendered light path. */
interface LightPathState {
	/** The deflected path line. */
	line: Line2;
	geometry: LineGeometry;
	material: Line2NodeMaterial;
	/** The straight-line reference (dashed). */
	refLine: Line2;
	refGeometry: LineGeometry;
	refMaterial: Line2NodeMaterial;
	/** Deflection highlight lines near massive bodies. */
	highlightLines: Line2[];
	highlightGeometries: LineGeometry[];
	highlightMaterials: Line2NodeMaterial[];
	/** Animated photon pulse marker. */
	pulse: Mesh;
	/** Path points in AU for pulse interpolation. */
	pathPoints: Vector3[];
	/** Full positions array for draw-in. */
	fullPositions: Float32Array;
	/** Total number of path points. */
	totalPoints: number;
	/** Pulse animation progress 0→1. */
	pulseProgress: number;
	/** Draw-in animation progress 0→1 (1 = fully drawn). */
	drawProgress: number;
	/** Whether the reference line is visible. */
	refVisible: boolean;
	/** Metadata from WASM result. */
	totalDistance: number;
	travelTime: number;
	straightLineDistance: number;
	totalDeflection: number;
	deflections: LightPathWasmResult['deflections'];
}

/** Color for the light path line. */
const DEFAULT_COLOR = 0x88ccff;
/** Color for the straight-line reference. */
const DEFAULT_REF_COLOR = 0x555577;
/** Color for the photon pulse dot. */
const DEFAULT_PULSE_COLOR = 0xffffff;
/** Color for deflection highlights near massive bodies. */
const HIGHLIGHT_COLOR = 0xffcc44;
/** Draw-in animation speed (fraction of path per second). */
const DRAW_IN_SPEED = 0.5; // completes in 2 seconds

export class LightPathRenderer {
	private group = new Group();
	private paths: Map<string, LightPathState> = new Map();
	private wasm: WasmLightPath | null;
	private lineWidth: number;
	private opacity: number;
	private color: number;
	private refColor: number;
	private pulseColor: number;
	private pulseSpeed: number;

	constructor(options: LightPathRendererOptions = {}) {
		this.wasm = options.wasm ?? null;
		this.lineWidth = options.lineWidth ?? 1.5;
		this.opacity = options.opacity ?? 0.6;
		this.color = options.color ?? DEFAULT_COLOR;
		this.refColor = options.referenceLineColor ?? DEFAULT_REF_COLOR;
		this.pulseColor = options.pulseColor ?? DEFAULT_PULSE_COLOR;
		this.pulseSpeed = options.pulseSpeed ?? 0.3; // loops per second
	}

	setWasm(wasm: WasmLightPath): void {
		this.wasm = wasm;
	}

	/**
	 * Compute and display a light path from source to target.
	 *
	 * @param id Unique identifier for this path (e.g. source name).
	 * @param sourceMeters Source position [x,y,z] in meters (heliocentric ecliptic J2000).
	 * @param targetMeters Target position [x,y,z] in meters.
	 * @param bodies Array of { position: [x,y,z] meters, gm: number } for lensing bodies.
	 * @param pointsPerSegment Interpolation resolution (default 200).
	 */
	showPath(
		id: string,
		sourceMeters: [number, number, number],
		targetMeters: [number, number, number],
		bodies: Array<{ position: [number, number, number]; gm: number }>,
		pointsPerSegment = 200
	): LightPathWasmResult | null {
		if (!this.wasm) return null;

		// Remove existing path with this id
		this.removePath(id);

		const result = this.wasm.compute_light_path(
			new Float64Array(sourceMeters),
			new Float64Array(targetMeters),
			bodies,
			pointsPerSegment
		);

		const numPoints = result.points.length / 3;
		if (numPoints < 2) return null;

		// Convert points from meters to AU for scene coordinates
		const positions = new Float32Array(numPoints * 3);
		const pathPoints: Vector3[] = [];

		for (let i = 0; i < numPoints; i++) {
			const x = result.points[i * 3] / METERS_PER_AU;
			const y = result.points[i * 3 + 1] / METERS_PER_AU;
			const z = result.points[i * 3 + 2] / METERS_PER_AU;
			positions[i * 3] = x;
			positions[i * 3 + 1] = y;
			positions[i * 3 + 2] = z;
			pathPoints.push(new Vector3(x, y, z));
		}

		// Start with just 2 points for draw-in animation (will expand in update())
		const initialPositions = new Float32Array(6);
		initialPositions[0] = positions[0];
		initialPositions[1] = positions[1];
		initialPositions[2] = positions[2];
		initialPositions[3] = positions[3];
		initialPositions[4] = positions[4];
		initialPositions[5] = positions[5];

		// Deflected path line
		const geometry = new LineGeometry();
		geometry.setPositions(initialPositions);

		const material = new Line2NodeMaterial({
			color: this.color,
			linewidth: this.lineWidth,
			transparent: true,
			opacity: this.opacity,
			depthWrite: false
		});

		const line = new Line2(geometry, material);
		line.computeLineDistances();
		this.group.add(line);

		// Straight-line reference (dashed) — hidden until draw-in completes
		const refPositions = new Float32Array(6);
		refPositions[0] = sourceMeters[0] / METERS_PER_AU;
		refPositions[1] = sourceMeters[1] / METERS_PER_AU;
		refPositions[2] = sourceMeters[2] / METERS_PER_AU;
		refPositions[3] = targetMeters[0] / METERS_PER_AU;
		refPositions[4] = targetMeters[1] / METERS_PER_AU;
		refPositions[5] = targetMeters[2] / METERS_PER_AU;

		const refGeometry = new LineGeometry();
		refGeometry.setPositions(refPositions);

		const refMaterial = new Line2NodeMaterial({
			color: this.refColor,
			linewidth: 0.8,
			transparent: true,
			opacity: 0.3,
			dashed: true,
			depthWrite: false
		});
		refMaterial.dashScaleNode = float(40);
		refMaterial.dashSizeNode = float(2);
		refMaterial.gapSizeNode = float(2);

		const refLine = new Line2(refGeometry, refMaterial);
		refLine.computeLineDistances();
		refLine.visible = false; // hidden during draw-in
		this.group.add(refLine);

		// Deflection highlights — brighter/thicker segments near massive bodies
		const { lines: highlightLines, geometries: highlightGeometries, materials: highlightMaterials } =
			this.buildDeflectionHighlights(pathPoints, result.deflections, bodies);
		for (const hl of highlightLines) {
			hl.visible = false; // hidden until draw-in reaches them
			this.group.add(hl);
		}

		// Photon pulse marker (small bright sphere) — hidden during draw-in
		const pulseGeo = new SphereGeometry(0.003, 8, 8);
		const pulseMat = new MeshBasicMaterial({
			color: this.pulseColor,
			transparent: true,
			opacity: 0.95,
			depthWrite: false
		});
		const pulse = new Mesh(pulseGeo, pulseMat);
		pulse.position.copy(pathPoints[0]);
		pulse.visible = false;
		this.group.add(pulse);

		const state: LightPathState = {
			line,
			geometry,
			material,
			refLine,
			refGeometry,
			refMaterial,
			highlightLines,
			highlightGeometries,
			highlightMaterials,
			pulse,
			pathPoints,
			fullPositions: positions,
			totalPoints: numPoints,
			pulseProgress: 0,
			drawProgress: 0,
			refVisible: true,
			totalDistance: result.total_distance,
			travelTime: result.travel_time,
			straightLineDistance: result.straight_line_distance,
			totalDeflection: result.total_deflection,
			deflections: result.deflections
		};

		this.paths.set(id, state);
		return result;
	}

	/** Remove a specific light path. */
	removePath(id: string): void {
		const state = this.paths.get(id);
		if (!state) return;
		this.disposeState(state);
		this.paths.delete(id);
	}

	/** Remove all light paths. */
	clear(): void {
		for (const [, state] of this.paths) {
			this.disposeState(state);
		}
		this.paths.clear();
	}

	/** Update draw-in animation and pulse. Call each frame. */
	update(delta: number): void {
		for (const [, state] of this.paths) {
			const pts = state.pathPoints;
			if (pts.length < 2) continue;

			// Draw-in animation
			if (state.drawProgress < 1) {
				state.drawProgress = Math.min(1, state.drawProgress + delta * DRAW_IN_SPEED);

				// Expand the visible portion of the line
				const visiblePoints = Math.max(2, Math.ceil(state.drawProgress * state.totalPoints));
				const slice = state.fullPositions.slice(0, visiblePoints * 3);
				state.geometry.setPositions(slice);
				state.line.computeLineDistances();

				// Move pulse to the draw front
				const frontIdx = visiblePoints - 1;
				state.pulse.visible = true;
				state.pulse.position.copy(pts[frontIdx]);

				// Show deflection highlights as draw reaches them
				this.updateHighlightVisibility(state);

				// When draw-in completes, show reference line and start pulse loop
				if (state.drawProgress >= 1) {
					state.refLine.visible = state.refVisible;
					state.pulseProgress = 0;
					this._onDrawComplete?.(state);
				}
				continue;
			}

			// Normal pulse animation (after draw-in)
			state.pulseProgress += delta * this.pulseSpeed;
			if (state.pulseProgress > 1) state.pulseProgress -= 1;

			const idx = state.pulseProgress * (pts.length - 1);
			const lo = Math.floor(idx);
			const hi = Math.min(lo + 1, pts.length - 1);
			const frac = idx - lo;
			state.pulse.position.lerpVectors(pts[lo], pts[hi], frac);
		}
	}

	/** Callback when draw-in animation completes. Set by page to update HUD state. */
	private _onDrawComplete: ((state: LightPathState) => void) | null = null;

	/** Register a callback for when draw-in animation finishes. */
	onDrawComplete(cb: () => void): void {
		this._onDrawComplete = () => cb();
	}

	/** Show a path immediately without draw-in animation. */
	skipDrawIn(id: string): void {
		const state = this.paths.get(id);
		if (!state) return;
		state.drawProgress = 1;
		state.geometry.setPositions(state.fullPositions);
		state.line.computeLineDistances();
		state.refLine.visible = state.refVisible;
		state.pulse.visible = true;
		for (const hl of state.highlightLines) hl.visible = true;
	}

	/** Check if a path's draw-in animation is still running. */
	isDrawing(id: string): boolean {
		const state = this.paths.get(id);
		return state ? state.drawProgress < 1 : false;
	}

	/** Update deflection highlight visibility based on draw progress. */
	private updateHighlightVisibility(state: LightPathState): void {
		const drawnFraction = state.drawProgress;
		// Highlights correspond to deflection events — show when draw reaches ~their position
		// Deflection points are roughly evenly distributed along the path
		for (let i = 0; i < state.highlightLines.length; i++) {
			// Show once we've drawn past roughly the midpoint of where this highlight sits
			const threshold = (i + 0.5) / Math.max(1, state.highlightLines.length);
			state.highlightLines[i].visible = drawnFraction >= threshold * 0.8;
		}
	}

	/** Build highlight line segments near each deflection body. */
	private buildDeflectionHighlights(
		pathPoints: Vector3[],
		deflections: LightPathWasmResult['deflections'],
		bodies: Array<{ position: [number, number, number]; gm: number }>
	): { lines: Line2[]; geometries: LineGeometry[]; materials: Line2NodeMaterial[] } {
		const lines: Line2[] = [];
		const geometries: LineGeometry[] = [];
		const materials: Line2NodeMaterial[] = [];

		if (pathPoints.length < 4) return { lines, geometries, materials };

		for (const defl of deflections) {
			if (defl.body_index >= bodies.length) continue;
			const bodyPos = new Vector3(
				bodies[defl.body_index].position[0] / METERS_PER_AU,
				bodies[defl.body_index].position[1] / METERS_PER_AU,
				bodies[defl.body_index].position[2] / METERS_PER_AU
			);

			// Find the closest path point to this body
			let closestIdx = 0;
			let closestDist = Infinity;
			for (let i = 0; i < pathPoints.length; i++) {
				const d = pathPoints[i].distanceTo(bodyPos);
				if (d < closestDist) {
					closestDist = d;
					closestIdx = i;
				}
			}

			// Extract a window of points around the closest approach
			const windowSize = Math.max(4, Math.floor(pathPoints.length * 0.08));
			const lo = Math.max(0, closestIdx - windowSize);
			const hi = Math.min(pathPoints.length - 1, closestIdx + windowSize);
			if (hi - lo < 2) continue;

			const segPositions = new Float32Array((hi - lo + 1) * 3);
			for (let i = lo; i <= hi; i++) {
				const j = i - lo;
				segPositions[j * 3] = pathPoints[i].x;
				segPositions[j * 3 + 1] = pathPoints[i].y;
				segPositions[j * 3 + 2] = pathPoints[i].z;
			}

			const hlGeom = new LineGeometry();
			hlGeom.setPositions(segPositions);

			// Brightness scales with deflection angle (capped)
			const angleDeg = defl.deflection_angle * (180 / Math.PI);
			const intensity = Math.min(1, angleDeg / 2); // full at 2+ arcsec
			const hlMat = new Line2NodeMaterial({
				color: HIGHLIGHT_COLOR,
				linewidth: this.lineWidth * (1.5 + intensity),
				transparent: true,
				opacity: 0.3 + 0.5 * intensity,
				depthWrite: false
			});

			const hlLine = new Line2(hlGeom, hlMat);
			hlLine.computeLineDistances();

			lines.push(hlLine);
			geometries.push(hlGeom);
			materials.push(hlMat);
		}

		return { lines, geometries, materials };
	}

	/** Toggle reference line visibility for all paths. */
	setReferenceVisible(visible: boolean): void {
		for (const [, state] of this.paths) {
			state.refLine.visible = visible;
			state.refVisible = visible;
		}
	}

	/** Set visibility of all light paths. */
	setAllVisible(visible: boolean): void {
		this.group.visible = visible;
	}

	/** Add to a scene. */
	addTo(scene: Scene): void {
		scene.add(this.group);
	}

	/** Remove from scene. */
	removeFrom(scene: Scene): void {
		scene.remove(this.group);
	}

	/** Get metadata for a specific path. */
	getPathInfo(id: string): {
		totalDistance: number;
		travelTime: number;
		straightLineDistance: number;
		totalDeflection: number;
		deflections: LightPathWasmResult['deflections'];
	} | null {
		const state = this.paths.get(id);
		if (!state) return null;
		return {
			totalDistance: state.totalDistance,
			travelTime: state.travelTime,
			straightLineDistance: state.straightLineDistance,
			totalDeflection: state.totalDeflection,
			deflections: state.deflections
		};
	}

	/** Whether any paths are currently shown. */
	get hasActivePaths(): boolean {
		return this.paths.size > 0;
	}

	/** Dispose all resources. */
	dispose(): void {
		this.clear();
		this.group.parent?.remove(this.group);
	}

	private disposeState(state: LightPathState): void {
		this.group.remove(state.line);
		state.geometry.dispose();
		state.material.dispose();
		this.group.remove(state.refLine);
		state.refGeometry.dispose();
		state.refMaterial.dispose();
		for (let i = 0; i < state.highlightLines.length; i++) {
			this.group.remove(state.highlightLines[i]);
			state.highlightGeometries[i].dispose();
			state.highlightMaterials[i].dispose();
		}
		this.group.remove(state.pulse);
		state.pulse.geometry.dispose();
		(state.pulse.material as MeshBasicMaterial).dispose();
	}
}
