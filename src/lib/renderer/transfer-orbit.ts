/**
 * Transfer orbit renderer for Hohmann transfer visualization.
 *
 * Draws a half-ellipse transfer path between two planetary orbits,
 * with departure/arrival markers, burn direction indicators, and an
 * animated spacecraft marker for fly-along mode.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 */

import { Line2NodeMaterial } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import {
	SphereGeometry,
	Mesh,
	MeshBasicMaterial,
	RingGeometry,
	Vector3,
	Group,
	DoubleSide
} from 'three/webgpu';
import type { Scene } from 'three/webgpu';
import { METERS_PER_AU } from './scale';

/** Hohmann transfer result from WASM (matches JsHohmannResult). */
export interface HohmannResult {
	delta_v1: number;
	delta_v2: number;
	delta_v_total: number;
	transfer_time: number;
	transfer_sma: number;
	transfer_eccentricity: number;
	phase_angle: number;
	synodic_period: number;
}

/** Full transfer plan with computed geometry. */
export interface TransferPlan {
	/** Departure body NAIF ID. */
	departureId: number;
	/** Arrival body NAIF ID. */
	arrivalId: number;
	/** Departure body name. */
	departureName: string;
	/** Arrival body name. */
	arrivalName: string;
	/** Hohmann result from WASM. */
	hohmann: HohmannResult;
	/** Departure position in AU (ecliptic). */
	departurePos: Vector3;
	/** Arrival position in AU (ecliptic). */
	arrivalPos: Vector3;
	/** Departure orbit radius in AU. */
	departureRadius: number;
	/** Arrival orbit radius in AU. */
	arrivalRadius: number;
	/** Julian Date of departure. */
	departureJD: number;
	/** Julian Date of arrival. */
	arrivalJD: number;
}

/** Number of sample points for the transfer ellipse. */
const TRANSFER_RESOLUTION = 128;
/** Color of the transfer orbit line. */
const TRANSFER_COLOR = 0xf0a030;
/** Color of the departure marker. */
const DEPARTURE_COLOR = 0x40c080;
/** Color of the arrival marker. */
const ARRIVAL_COLOR = 0xf06040;
/** Color of the spacecraft marker. */
const CRAFT_COLOR = 0xf0e060;

export class TransferOrbitRenderer {
	private group = new Group();
	private transferLine: Line2 | null = null;
	private transferGeometry: LineGeometry | null = null;
	private transferMaterial: Line2NodeMaterial | null = null;
	private departureMarker: Mesh | null = null;
	private arrivalMarker: Mesh | null = null;
	private craftMarker: Mesh | null = null;

	/** Cached transfer path points (AU) for fly-along interpolation. */
	private pathPoints: Vector3[] = [];
	/** Current transfer plan. */
	private _plan: TransferPlan | null = null;

	get plan(): TransferPlan | null {
		return this._plan;
	}

	/**
	 * Compute and display a Hohmann transfer orbit.
	 *
	 * The transfer ellipse is drawn as a half-ellipse from the departure
	 * position to the arrival orbit. The departure angle determines the
	 * orientation of the transfer ellipse.
	 */
	showTransfer(plan: TransferPlan): void {
		this.clear();
		this._plan = plan;

		const { departurePos, departureRadius, arrivalRadius, hohmann } = plan;

		// Transfer ellipse parameters
		const smaAU = hohmann.transfer_sma / METERS_PER_AU;
		const ecc = hohmann.transfer_eccentricity;

		// Departure angle in the ecliptic plane
		const departureAngle = Math.atan2(departurePos.z, departurePos.x);

		// Whether we're going outward (departure is inner orbit)
		const outward = departureRadius < arrivalRadius;

		// Build the half-ellipse path
		// For an outward Hohmann: periapsis is at departure, apoapsis at arrival
		// For an inward Hohmann: apoapsis is at departure, periapsis at arrival
		this.pathPoints = [];
		const positions = new Float32Array((TRANSFER_RESOLUTION + 1) * 3);

		for (let i = 0; i <= TRANSFER_RESOLUTION; i++) {
			// True anomaly sweeps 0 to PI (half orbit)
			const nu = (i / TRANSFER_RESOLUTION) * Math.PI;
			// Radius from vis-viva / conic equation
			const r = (smaAU * (1 - ecc * ecc)) / (1 + ecc * Math.cos(nu));

			// Angle in ecliptic: departure angle + swept angle
			// For outward: periapsis at departure angle, so orbital angle = departureAngle + nu
			// For inward: apoapsis at departure angle, so orbital angle = departureAngle + nu
			//   but the transfer starts at apoapsis (nu = PI), so we flip
			let angle: number;
			if (outward) {
				angle = departureAngle + nu;
			} else {
				// Inward: start at apoapsis (nu=PI), sweep to periapsis (nu=0)
				angle = departureAngle + (Math.PI - nu);
			}

			const x = r * Math.cos(angle);
			const z = r * Math.sin(angle);

			positions[i * 3] = x;
			positions[i * 3 + 1] = 0; // ecliptic plane
			positions[i * 3 + 2] = z;
			this.pathPoints.push(new Vector3(x, 0, z));
		}

		// Create transfer line
		this.transferGeometry = new LineGeometry();
		this.transferGeometry.setPositions(positions);

		this.transferMaterial = new Line2NodeMaterial({
			color: TRANSFER_COLOR,
			linewidth: 2.0,
			transparent: true,
			opacity: 0.7,
			depthWrite: false
		});

		this.transferLine = new Line2(this.transferGeometry, this.transferMaterial);
		this.transferLine.computeLineDistances();
		this.group.add(this.transferLine);

		// Departure marker (green ring)
		const depGeo = new RingGeometry(
			departureRadius * 0.6 + 0.003,
			departureRadius * 0.6 + 0.006,
			32
		);
		const depMat = new MeshBasicMaterial({
			color: DEPARTURE_COLOR,
			transparent: true,
			opacity: 0.8,
			side: DoubleSide,
			depthWrite: false
		});
		this.departureMarker = new Mesh(depGeo, depMat);
		this.departureMarker.position.copy(this.pathPoints[0]);
		this.departureMarker.rotation.x = -Math.PI / 2; // face up in ecliptic
		this.group.add(this.departureMarker);

		// Arrival marker (red ring)
		const arrGeo = new RingGeometry(
			arrivalRadius * 0.6 + 0.003,
			arrivalRadius * 0.6 + 0.006,
			32
		);
		const arrMat = new MeshBasicMaterial({
			color: ARRIVAL_COLOR,
			transparent: true,
			opacity: 0.8,
			side: DoubleSide,
			depthWrite: false
		});
		this.arrivalMarker = new Mesh(arrGeo, arrMat);
		this.arrivalMarker.position.copy(this.pathPoints[this.pathPoints.length - 1]);
		this.arrivalMarker.rotation.x = -Math.PI / 2;
		this.group.add(this.arrivalMarker);

		// Spacecraft marker (small sphere)
		const craftGeo = new SphereGeometry(0.004, 8, 8);
		const craftMat = new MeshBasicMaterial({
			color: CRAFT_COLOR,
			transparent: true,
			opacity: 0.9,
			depthWrite: false
		});
		this.craftMarker = new Mesh(craftGeo, craftMat);
		this.craftMarker.visible = false; // shown during fly-along
		this.group.add(this.craftMarker);
	}

	/**
	 * Get the interpolated position along the transfer path.
	 * @param t Progress 0 (departure) to 1 (arrival)
	 * @returns Position in AU
	 */
	getPositionAt(t: number): Vector3 {
		if (this.pathPoints.length === 0) return new Vector3();
		const clamped = Math.max(0, Math.min(1, t));
		const idx = clamped * (this.pathPoints.length - 1);
		const lo = Math.floor(idx);
		const hi = Math.min(lo + 1, this.pathPoints.length - 1);
		const frac = idx - lo;
		return this.pathPoints[lo].clone().lerp(this.pathPoints[hi], frac);
	}

	/**
	 * Update spacecraft marker position during fly-along.
	 * @param t Progress 0 to 1
	 */
	updateCraft(t: number): void {
		if (!this.craftMarker) return;
		this.craftMarker.visible = true;
		this.craftMarker.position.copy(this.getPositionAt(t));
	}

	/** Hide the spacecraft marker. */
	hideCraft(): void {
		if (this.craftMarker) this.craftMarker.visible = false;
	}

	/** Add the transfer group to a scene. */
	addTo(scene: Scene): void {
		scene.add(this.group);
	}

	/** Remove transfer visualization. */
	clear(): void {
		if (this.transferLine) {
			this.group.remove(this.transferLine);
			this.transferGeometry?.dispose();
			this.transferMaterial?.dispose();
			this.transferLine = null;
			this.transferGeometry = null;
			this.transferMaterial = null;
		}
		if (this.departureMarker) {
			this.group.remove(this.departureMarker);
			this.departureMarker.geometry.dispose();
			(this.departureMarker.material as MeshBasicMaterial).dispose();
			this.departureMarker = null;
		}
		if (this.arrivalMarker) {
			this.group.remove(this.arrivalMarker);
			this.arrivalMarker.geometry.dispose();
			(this.arrivalMarker.material as MeshBasicMaterial).dispose();
			this.arrivalMarker = null;
		}
		if (this.craftMarker) {
			this.group.remove(this.craftMarker);
			this.craftMarker.geometry.dispose();
			(this.craftMarker.material as MeshBasicMaterial).dispose();
			this.craftMarker = null;
		}
		this.pathPoints = [];
		this._plan = null;
	}

	/** Whether a transfer is currently displayed. */
	get visible(): boolean {
		return this._plan !== null;
	}

	/** Dispose all resources. */
	dispose(): void {
		this.clear();
		this.group.parent?.remove(this.group);
	}
}
