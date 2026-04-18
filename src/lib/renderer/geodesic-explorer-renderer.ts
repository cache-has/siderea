/**
 * Geodesic explorer renderer — interactive visualization of photon trajectories
 * near a Schwarzschild black hole.
 *
 * Renders in the near scene (1 unit = 1 AU):
 * - Event horizon sphere (black)
 * - Photon sphere ring (yellow, r = 1.5 r_s)
 * - ISCO ring (cyan, r = 3 r_s)
 * - Fan of geodesic paths at different impact parameters, color-coded:
 *   - Red: capture trajectories (b < b_crit)
 *   - Orange/yellow: near-critical (b ≈ b_crit, unstable orbit)
 *   - Cyan/blue: deflection trajectories (b > b_crit)
 * - One highlighted "active" geodesic controlled by the user
 *
 * Coordinates: near-scene space, centered at origin. All WASM output is in
 * meters; converted to AU via METERS_PER_AU.
 *
 * Sources:
 * - Schwarzschild radius: r_s = 2GM/c²
 * - Photon sphere: r_ph = 1.5 r_s
 * - ISCO: r_isco = 3 r_s
 * - Critical impact parameter: b_crit = 3√3 GM/c²
 */

import {
	Group,
	SphereGeometry,
	RingGeometry,
	Mesh,
	MeshBasicNodeMaterial,
	AdditiveBlending,
	DoubleSide
} from 'three/webgpu';
import { Line2NodeMaterial } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { vec3, float } from 'three/tsl';
import type { Scene } from 'three/webgpu';
import { METERS_PER_AU } from './scale';
import type { WasmLightPath, BlackHoleGeometryResult } from './light-path-renderer';

/** Trajectory classification for display. */
export type TrajectoryType = 'capture' | 'unstable_orbit' | 'deflection';

/** Info about the currently active (user-controlled) geodesic. */
export interface ActiveGeodesicInfo {
	impactParameter: number;
	impactParameterRs: number;
	trajectoryType: TrajectoryType;
	numPoints: number;
}

/** Colors for trajectory types. */
const TRAJECTORY_COLORS: Record<TrajectoryType, number> = {
	capture: 0xff3030,
	unstable_orbit: 0xffaa20,
	deflection: 0x40ccff
};

/** Fan line opacity. */
const FAN_OPACITY = 0.25;
/** Active geodesic line opacity. */
const ACTIVE_OPACITY = 0.85;
/** Active geodesic line width. */
const ACTIVE_LINE_WIDTH = 2.5;
/** Fan geodesic line width. */
const FAN_LINE_WIDTH = 1.0;

/** Number of integration steps for geodesic paths. */
const NUM_STEPS = 2000;
/** Azimuthal range for integration (radians). Enough for multiple orbits. */
const PHI_RANGE = 4 * Math.PI;

interface FanPath {
	line: Line2;
	geometry: LineGeometry;
	material: Line2NodeMaterial;
	impactParameter: number;
	trajectoryType: TrajectoryType;
}

export class GeodesicExplorerRenderer {
	private group = new Group();
	private wasm: WasmLightPath | null = null;

	// Black hole state
	private gm = 0;
	private geometry: BlackHoleGeometryResult | null = null;

	// Reference geometry meshes
	private eventHorizon: Mesh | null = null;
	private photonSphereRing: Mesh | null = null;
	private iscoRing: Mesh | null = null;
	private refMaterials: MeshBasicNodeMaterial[] = [];

	// Geodesic fan
	private fanPaths: FanPath[] = [];
	private fanVisible = true;

	// Active (user-controlled) geodesic
	private activeLine: Line2 | null = null;
	private activeGeometry: LineGeometry | null = null;
	private activeMaterial: Line2NodeMaterial | null = null;
	private activeInfo: ActiveGeodesicInfo | null = null;

	setWasm(wasm: WasmLightPath): void {
		this.wasm = wasm;
	}

	/**
	 * Set up the explorer for a specific black hole.
	 * Computes geometry, builds reference meshes, and generates the geodesic fan.
	 */
	setBlackHole(gm: number): void {
		if (!this.wasm) return;
		if (gm === this.gm && this.geometry) return; // already set up

		this.clearAll();
		this.gm = gm;

		const geom = this.wasm.get_black_hole_geometry(gm);
		this.geometry = geom;

		this.buildReferenceGeometry(geom);
		this.buildGeodesicFan(geom);
		// Start with active geodesic at 1.5x critical (nice deflection)
		this.setImpactParameter(geom.critical_impact_parameter * 1.5);
	}

	/**
	 * Update the active (highlighted) geodesic to a new impact parameter.
	 * @param b Impact parameter in meters.
	 */
	setImpactParameter(b: number): void {
		if (!this.wasm || !this.geometry) return;

		// Remove old active geodesic
		this.disposeActive();

		const geom = this.geometry;
		const trajType = this.classifyTrajectory(b, geom.critical_impact_parameter);

		// Compute the geodesic via WASM
		let points: Float64Array;
		try {
			points = this.wasm.compute_schwarzschild_geodesic(
				this.gm,
				b,
				PHI_RANGE,
				NUM_STEPS
			);
		} catch {
			return; // invalid parameters
		}

		const numPoints = points.length / 3;
		if (numPoints < 2) return;

		// Convert meters → AU
		const positions = new Float32Array(numPoints * 3);
		for (let i = 0; i < numPoints * 3; i++) {
			positions[i] = points[i] / METERS_PER_AU;
		}

		const lineGeom = new LineGeometry();
		lineGeom.setPositions(positions);

		const color = TRAJECTORY_COLORS[trajType];
		const material = new Line2NodeMaterial({
			color,
			linewidth: ACTIVE_LINE_WIDTH,
			transparent: true,
			opacity: ACTIVE_OPACITY,
			depthWrite: false
		});

		const line = new Line2(lineGeom, material);
		line.computeLineDistances();
		this.group.add(line);

		this.activeLine = line;
		this.activeGeometry = lineGeom;
		this.activeMaterial = material;
		this.activeInfo = {
			impactParameter: b,
			impactParameterRs: b / geom.schwarzschild_radius,
			trajectoryType: trajType,
			numPoints
		};
	}

	/** Get info about the current active geodesic. */
	getActiveInfo(): ActiveGeodesicInfo | null {
		return this.activeInfo;
	}

	/** Get the black hole geometry (radii etc.) in meters. */
	getGeometry(): BlackHoleGeometryResult | null {
		return this.geometry;
	}

	/** Toggle the geodesic fan visibility. */
	setFanVisible(visible: boolean): void {
		this.fanVisible = visible;
		for (const fp of this.fanPaths) {
			fp.line.visible = visible;
		}
	}

	/** Set visibility of the entire explorer. */
	setVisible(visible: boolean): void {
		this.group.visible = visible;
	}

	/** Add to a Three.js scene. */
	addTo(scene: Scene): void {
		scene.add(this.group);
	}

	/** Remove from scene. */
	removeFrom(scene: Scene): void {
		scene.remove(this.group);
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		this.clearAll();
		this.group.parent?.remove(this.group);
	}

	// ---- Private: Reference geometry ----

	private buildReferenceGeometry(geom: BlackHoleGeometryResult): void {
		const rsAU = geom.schwarzschild_radius / METERS_PER_AU;
		const phAU = geom.photon_sphere_radius / METERS_PER_AU;
		const iscoAU = geom.isco_radius / METERS_PER_AU;

		// Event horizon — solid black sphere
		const ehGeom = new SphereGeometry(rsAU, 32, 16);
		const ehMat = new MeshBasicNodeMaterial();
		ehMat.colorNode = vec3(0.02, 0.0, 0.02);
		this.refMaterials.push(ehMat);
		this.eventHorizon = new Mesh(ehGeom, ehMat);
		this.group.add(this.eventHorizon);

		// Photon sphere — semi-transparent ring
		const phGeom = new RingGeometry(phAU * 0.98, phAU * 1.02, 128, 1);
		const phMat = new MeshBasicNodeMaterial({
			side: DoubleSide,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending
		});
		phMat.colorNode = vec3(1.0, 0.85, 0.2);
		phMat.opacityNode = float(0.4);
		this.refMaterials.push(phMat);
		this.photonSphereRing = new Mesh(phGeom, phMat);
		this.group.add(this.photonSphereRing);

		// ISCO — semi-transparent ring
		const iscoGeom = new RingGeometry(iscoAU * 0.98, iscoAU * 1.02, 128, 1);
		const iscoMat = new MeshBasicNodeMaterial({
			side: DoubleSide,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending
		});
		iscoMat.colorNode = vec3(0.2, 0.85, 1.0);
		iscoMat.opacityNode = float(0.3);
		this.refMaterials.push(iscoMat);
		this.iscoRing = new Mesh(iscoGeom, iscoMat);
		this.group.add(this.iscoRing);
	}

	// ---- Private: Geodesic fan ----

	private buildGeodesicFan(geom: BlackHoleGeometryResult): void {
		if (!this.wasm) return;

		const bCrit = geom.critical_impact_parameter;

		// Sample impact parameters across the three regimes
		const bValues: number[] = [
			// Capture (b < b_crit)
			bCrit * 0.5,
			bCrit * 0.7,
			bCrit * 0.85,
			bCrit * 0.95,
			// Near-critical (b ≈ b_crit)
			bCrit * 0.99,
			bCrit * 1.001,
			bCrit * 1.01,
			// Deflection (b > b_crit)
			bCrit * 1.05,
			bCrit * 1.15,
			bCrit * 1.3,
			bCrit * 1.6,
			bCrit * 2.0,
			bCrit * 3.0,
			bCrit * 5.0
		];

		for (const b of bValues) {
			let points: Float64Array;
			try {
				points = this.wasm.compute_schwarzschild_geodesic(
					this.gm,
					b,
					PHI_RANGE,
					NUM_STEPS
				);
			} catch {
				continue;
			}

			const numPoints = points.length / 3;
			if (numPoints < 2) continue;

			const positions = new Float32Array(numPoints * 3);
			for (let i = 0; i < numPoints * 3; i++) {
				positions[i] = points[i] / METERS_PER_AU;
			}

			const trajType = this.classifyTrajectory(b, bCrit);
			const color = TRAJECTORY_COLORS[trajType];

			const lineGeom = new LineGeometry();
			lineGeom.setPositions(positions);

			const material = new Line2NodeMaterial({
				color,
				linewidth: FAN_LINE_WIDTH,
				transparent: true,
				opacity: FAN_OPACITY,
				depthWrite: false
			});

			const line = new Line2(lineGeom, material);
			line.computeLineDistances();
			line.visible = this.fanVisible;
			this.group.add(line);

			this.fanPaths.push({ line, geometry: lineGeom, material, impactParameter: b, trajectoryType: trajType });
		}
	}

	// ---- Private: Classification ----

	private classifyTrajectory(b: number, bCrit: number): TrajectoryType {
		const ratio = b / bCrit;
		if (ratio < 0.999) return 'capture';
		if (ratio < 1.005) return 'unstable_orbit';
		return 'deflection';
	}

	// ---- Private: Cleanup ----

	private disposeActive(): void {
		if (this.activeLine) {
			this.group.remove(this.activeLine);
			this.activeGeometry?.dispose();
			this.activeMaterial?.dispose();
			this.activeLine = null;
			this.activeGeometry = null;
			this.activeMaterial = null;
			this.activeInfo = null;
		}
	}

	private clearAll(): void {
		this.disposeActive();

		// Fan paths
		for (const fp of this.fanPaths) {
			this.group.remove(fp.line);
			fp.geometry.dispose();
			fp.material.dispose();
		}
		this.fanPaths = [];

		// Reference geometry
		if (this.eventHorizon) {
			this.group.remove(this.eventHorizon);
			this.eventHorizon.geometry.dispose();
			this.eventHorizon = null;
		}
		if (this.photonSphereRing) {
			this.group.remove(this.photonSphereRing);
			this.photonSphereRing.geometry.dispose();
			this.photonSphereRing = null;
		}
		if (this.iscoRing) {
			this.group.remove(this.iscoRing);
			this.iscoRing.geometry.dispose();
			this.iscoRing = null;
		}
		for (const m of this.refMaterials) m.dispose();
		this.refMaterials = [];

		this.gm = 0;
		this.geometry = null;
	}
}
