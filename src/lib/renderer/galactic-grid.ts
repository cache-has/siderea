/**
 * Galactic plane reference grid for the far (stellar) scene.
 *
 * Renders concentric rings on the galactic plane centered at the galactic center,
 * providing spatial reference for galactic structure. Rings at 5, 10, 15, 20 kpc.
 *
 * Uses Line2 (WebGPU fat lines) with distance-based opacity fade,
 * matching the orbit path visual style.
 *
 * Coordinates: far-scene space, 1 unit = 1 parsec (J2000 equatorial).
 */

import { Line2NodeMaterial, Group } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import type { Scene } from 'three/webgpu';
import { float, uniform, Fn, smoothstep as tslSmoothstep } from 'three/tsl';
import {
	GALACTIC_CENTER_POS,
	GALACTIC_PLANE_QUATERNION
} from './galactic-constants';

export interface GalacticGridOptions {
	/** Ring radii in parsecs. @default [5000, 10000, 15000, 20000] */
	ringRadii?: number[];
	/** Number of segments per ring. @default 128 */
	segments?: number;
	/** Line width in pixels. @default 1.0 */
	lineWidth?: number;
	/** Base opacity. @default 0.15 */
	opacity?: number;
	/** Ring line color (hex). @default 0x4466aa */
	color?: number;
}

const DEFAULTS: Required<GalacticGridOptions> = {
	ringRadii: [5000, 10000, 15000, 20000],
	segments: 128,
	lineWidth: 1.0,
	opacity: 0.15,
	color: 0x4466aa
};

export class GalacticGridRenderer {
	private group: Group;
	private materials: Line2NodeMaterial[] = [];
	private geometries: LineGeometry[] = [];
	private _visible = true;

	constructor(options: GalacticGridOptions = {}) {
		const opts = { ...DEFAULTS, ...options };
		this.group = new Group();

		// Position at galactic center and orient to galactic plane
		this.group.position.copy(GALACTIC_CENTER_POS);
		this.group.quaternion.copy(GALACTIC_PLANE_QUATERNION);

		for (const radius of opts.ringRadii) {
			const { geo, mat, line } = this.createRing(radius, opts);
			this.geometries.push(geo);
			this.materials.push(mat);
			this.group.add(line);
		}
	}

	private createRing(
		radius: number,
		opts: Required<GalacticGridOptions>
	): { geo: LineGeometry; mat: Line2NodeMaterial; line: Line2 } {
		const { segments, lineWidth, opacity, color } = opts;

		// Generate ring vertices in the XY plane (Z=0)
		const positions: number[] = [];
		for (let i = 0; i <= segments; i++) {
			const theta = (i / segments) * Math.PI * 2;
			positions.push(
				Math.cos(theta) * radius,
				Math.sin(theta) * radius,
				0
			);
		}

		const geo = new LineGeometry();
		geo.setPositions(positions);

		// Dimmer for outer rings (farther = less useful as reference)
		const radiusFactor = Math.max(0.4, 1.0 - radius / 25000);

		const mat = new Line2NodeMaterial({
			color,
			linewidth: lineWidth,
			transparent: true,
			depthWrite: false
		});

		const baseOpacity = uniform(opacity * radiusFactor);
		mat.opacityNode = /* @__PURE__ */ Fn(() => {
			return baseOpacity;
		})();

		const line = new Line2(geo, mat);
		line.computeLineDistances();
		line.renderOrder = -3;

		return { geo, mat, line };
	}

	/** Add the grid to a scene. */
	addTo(scene: Scene): void {
		scene.add(this.group);
	}

	/** Remove the grid from a scene. */
	removeFrom(scene: Scene): void {
		scene.remove(this.group);
	}

	/** Toggle visibility. */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this.group.visible = visible;
	}

	get visible(): boolean {
		return this._visible;
	}

	/** Clean up GPU resources. */
	dispose(): void {
		this.group.removeFromParent();
		for (const g of this.geometries) g.dispose();
		for (const m of this.materials) m.dispose();
	}
}
