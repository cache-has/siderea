/**
 * Object picker — handles click-to-select for both near-scene (raycast)
 * and far-scene (screen-space proximity) objects.
 *
 * Near-scene: raycasts against registered meshes and maps hits to body data.
 * Far-scene: projects notable star positions to screen space and finds the
 * nearest star within a pixel threshold of the click point.
 */

import { Raycaster, Vector2, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera, Mesh, Scene } from 'three/webgpu';
import type { SolarSystemBody, Satellite, NotableStar } from '$lib/data/types';
import type { StarCatalog } from '$lib/data/star-catalog';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A near-scene object registered for picking. */
export interface PickableBody {
	mesh: Mesh;
	body: SolarSystemBody;
	/** Radius in AU (after exaggeration). */
	radiusAU: number;
}

/** A near-scene satellite registered for picking. */
export interface PickableSatellite {
	mesh: Mesh;
	satellite: Satellite;
}

/** Result of a pick operation. */
export type PickResult =
	| { kind: 'body'; body: SolarSystemBody; position: Vector3; radiusAU: number }
	| { kind: 'satellite'; satellite: Satellite; position: Vector3 }
	| { kind: 'star'; star: NotableStar; position: Vector3 }
	| null;

export interface ObjectPickerOptions {
	/** Near-scene camera (AU space). */
	nearCamera: PerspectiveCamera;
	/** Far-scene camera (parsec space). */
	farCamera: PerspectiveCamera;
	/** Near scene for raycasting. */
	nearScene: Scene;
	/** Canvas element for coordinate conversion. */
	canvas: HTMLCanvasElement;
	/** Maximum screen-space distance (pixels) for star proximity pick. @default 30 */
	starPickRadius?: number;
}

// ─── Picker ─────────────────────────────────────────────────────────────────

const _ndc = new Vector2();
const _projected = new Vector3();
const _worldPos = new Vector3();

export class ObjectPicker {
	private nearCamera: PerspectiveCamera;
	private farCamera: PerspectiveCamera;
	private nearScene: Scene;
	private canvas: HTMLCanvasElement;
	private raycaster = new Raycaster();
	private starPickRadius: number;

	private bodies: PickableBody[] = [];
	private satellites: PickableSatellite[] = [];
	private starCatalog: StarCatalog | null = null;

	/** Map from mesh UUID to pickable body for fast reverse lookup. */
	private meshToBody = new Map<string, PickableBody>();
	private meshToSatellite = new Map<string, PickableSatellite>();

	constructor(options: ObjectPickerOptions) {
		this.nearCamera = options.nearCamera;
		this.farCamera = options.farCamera;
		this.nearScene = options.nearScene;
		this.canvas = options.canvas;
		this.starPickRadius = options.starPickRadius ?? 30;
	}

	/** Register a solar system body mesh for picking. */
	registerBody(mesh: Mesh, body: SolarSystemBody, radiusAU: number): void {
		const entry: PickableBody = { mesh, body, radiusAU };
		this.bodies.push(entry);
		this.meshToBody.set(mesh.uuid, entry);
	}

	/** Remove a body from the picker registry. */
	unregisterBody(mesh: Mesh): void {
		this.meshToBody.delete(mesh.uuid);
		this.bodies = this.bodies.filter((b) => b.mesh !== mesh);
	}

	/** Register a satellite mesh for picking. */
	registerSatellite(mesh: Mesh, satellite: Satellite): void {
		const entry: PickableSatellite = { mesh, satellite };
		this.satellites.push(entry);
		this.meshToSatellite.set(mesh.uuid, entry);
	}

	/** Set the star catalog for screen-space star proximity picking. */
	setStarCatalog(catalog: StarCatalog): void {
		this.starCatalog = catalog;
	}

	/**
	 * Pick at a screen position. Tries near-scene raycast first, then
	 * falls back to far-scene star proximity.
	 * @param clientX Screen X coordinate (from MouseEvent.clientX).
	 * @param clientY Screen Y coordinate (from MouseEvent.clientY).
	 */
	pick(clientX: number, clientY: number): PickResult {
		const rect = this.canvas.getBoundingClientRect();
		_ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		_ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

		// 1. Try near-scene raycast
		const nearResult = this.pickNearScene(_ndc);
		if (nearResult) return nearResult;

		// 2. Try far-scene star proximity
		const starResult = this.pickStar(clientX, clientY, rect);
		if (starResult) return starResult;

		return null;
	}

	private pickNearScene(ndc: Vector2): PickResult {
		this.raycaster.setFromCamera(ndc, this.nearCamera);
		const hits = this.raycaster.intersectObjects(this.nearScene.children, true);

		for (const hit of hits) {
			// Walk up the object hierarchy to find a registered mesh
			let obj = hit.object;
			while (obj) {
				const bodyEntry = this.meshToBody.get(obj.uuid);
				if (bodyEntry) {
					const pos = bodyEntry.mesh.getWorldPosition(_worldPos);
					return {
						kind: 'body',
						body: bodyEntry.body,
						position: pos.clone(),
						radiusAU: bodyEntry.radiusAU
					};
				}
				const satEntry = this.meshToSatellite.get(obj.uuid);
				if (satEntry) {
					const pos = satEntry.mesh.getWorldPosition(_worldPos);
					return {
						kind: 'satellite',
						satellite: satEntry.satellite,
						position: pos.clone()
					};
				}
				obj = obj.parent!;
			}
		}
		return null;
	}

	private pickStar(
		clientX: number,
		clientY: number,
		rect: DOMRect
	): PickResult {
		if (!this.starCatalog) return null;

		const halfW = rect.width / 2;
		const halfH = rect.height / 2;
		const screenX = clientX - rect.left;
		const screenY = clientY - rect.top;

		let bestStar: NotableStar | null = null;
		let bestDist2 = this.starPickRadius * this.starPickRadius;
		let bestPos = new Vector3();

		for (const star of this.starCatalog.notable) {
			const i = star.index * 3;
			_projected.set(
				this.starCatalog.data.positions[i],
				this.starCatalog.data.positions[i + 1],
				this.starCatalog.data.positions[i + 2]
			);

			// Project to screen space using far camera
			_projected.project(this.farCamera);

			// Check if behind camera
			if (_projected.z > 1) continue;

			const sx = (_projected.x + 1) * halfW;
			const sy = (-_projected.y + 1) * halfH;

			const dx = sx - screenX;
			const dy = sy - screenY;
			const dist2 = dx * dx + dy * dy;

			if (dist2 < bestDist2) {
				bestDist2 = dist2;
				bestStar = star;
				bestPos = new Vector3(
					this.starCatalog.data.positions[i],
					this.starCatalog.data.positions[i + 1],
					this.starCatalog.data.positions[i + 2]
				);
			}
		}

		if (bestStar) {
			return { kind: 'star', star: bestStar, position: bestPos };
		}
		return null;
	}

	dispose(): void {
		this.bodies = [];
		this.satellites = [];
		this.meshToBody.clear();
		this.meshToSatellite.clear();
		this.starCatalog = null;
	}
}
