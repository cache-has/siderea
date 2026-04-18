/**
 * Scale reference markers for the far (stellar) scene.
 *
 * Renders concentric distance rings centered at Sol (origin) at logarithmic
 * intervals, with HTML labels showing distance in parsecs and light-years.
 * Provides spatial scale awareness when navigating deep space.
 *
 * Rings lie in the J2000 equatorial XY plane (arbitrary choice — they're
 * reference markers, not physical structure). Labels are projected from
 * 3D to screen coordinates like star labels.
 *
 * Coordinates: far-scene space, 1 unit = 1 parsec.
 */

import { Line2NodeMaterial, Group, Vector3 } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import type { Scene, PerspectiveCamera } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { pcToLy } from './galactic-constants';

export interface ScaleMarkerOptions {
	/** Ring distances in parsecs. @default [10, 100, 1000, 10000] */
	distances?: number[];
	/** Segments per ring. @default 96 */
	segments?: number;
	/** Line width in pixels. @default 0.8 */
	lineWidth?: number;
	/** Base opacity. @default 0.12 */
	opacity?: number;
	/** Line color (hex). @default 0x5588aa */
	color?: number;
}

const DEFAULTS: Required<ScaleMarkerOptions> = {
	distances: [10, 100, 1000, 10000],
	segments: 96,
	lineWidth: 0.8,
	opacity: 0.12,
	color: 0x5588aa
};

interface RingLabel {
	position: Vector3;
	element: HTMLDivElement;
	distancePc: number;
}

export class ScaleMarkerRenderer {
	private group: Group;
	private materials: Line2NodeMaterial[] = [];
	private geometries: LineGeometry[] = [];
	private labelContainer: HTMLDivElement | null = null;
	private labels: RingLabel[] = [];
	private _visible = true;

	constructor(canvas: HTMLCanvasElement, options: ScaleMarkerOptions = {}) {
		const opts = { ...DEFAULTS, ...options };
		this.group = new Group();

		// Create label container
		this.labelContainer = document.createElement('div');
		this.labelContainer.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:1';
		canvas.parentElement!.style.position = 'relative';
		canvas.parentElement!.appendChild(this.labelContainer);

		for (const dist of opts.distances) {
			this.createRing(dist, opts);
		}
	}

	private createRing(distance: number, opts: Required<ScaleMarkerOptions>): void {
		const { segments, lineWidth, opacity, color } = opts;

		// Ring in the XY plane centered at origin
		const positions: number[] = [];
		for (let i = 0; i <= segments; i++) {
			const theta = (i / segments) * Math.PI * 2;
			positions.push(
				Math.cos(theta) * distance,
				Math.sin(theta) * distance,
				0
			);
		}

		const geo = new LineGeometry();
		geo.setPositions(positions);

		const mat = new Line2NodeMaterial({
			color,
			linewidth: lineWidth,
			transparent: true,
			depthWrite: false,
			opacity
		});

		const line = new Line2(geo, mat);
		line.computeLineDistances();
		line.renderOrder = -4;

		this.geometries.push(geo);
		this.materials.push(mat);
		this.group.add(line);

		// Label at the +X point of the ring
		if (this.labelContainer) {
			const el = document.createElement('div');
			const ly = pcToLy(distance);
			const pcLabel = distance >= 1000 ? `${(distance / 1000).toFixed(0)} kpc` : `${distance} pc`;
			const lyLabel = ly >= 1000 ? `${(ly / 1000).toFixed(1)} kly` : `${ly.toFixed(0)} ly`;
			el.textContent = `${pcLabel} / ${lyLabel}`;
			el.style.cssText =
				'position:absolute;color:rgba(100,150,200,0.5);font:400 9px/1 system-ui,sans-serif;' +
				'white-space:nowrap;opacity:0;transition:opacity 0.15s;pointer-events:none;' +
				'transform:translate(4px,-50%);letter-spacing:0.05em';
			this.labelContainer.appendChild(el);

			this.labels.push({
				position: new Vector3(distance, 0, 0),
				element: el,
				distancePc: distance
			});
		}
	}

	/** Add rings to the far scene. */
	addTo(scene: Scene): void {
		scene.add(this.group);
	}

	/** Remove rings from the scene. */
	removeFrom(scene: Scene): void {
		scene.remove(this.group);
	}

	/**
	 * Update label positions. Call once per frame.
	 */
	update(camera: PerspectiveCamera, canvasWidth: number, canvasHeight: number): void {
		if (!this._visible) return;

		const halfW = canvasWidth / 2;
		const halfH = canvasHeight / 2;
		const _projected = new Vector3();
		const camDist = camera.position.length();

		for (const label of this.labels) {
			// Only show labels for rings within a reasonable range of camera distance
			// (don't show the 10 pc label when camera is at 10,000 pc)
			const ratio = label.distancePc / Math.max(camDist, 0.01);
			if (ratio < 0.01 || ratio > 100) {
				label.element.style.opacity = '0';
				continue;
			}

			_projected.copy(label.position).project(camera);

			if (
				_projected.z > 1 || _projected.z < -1 ||
				_projected.x < -1.1 || _projected.x > 1.1 ||
				_projected.y < -1.1 || _projected.y > 1.1
			) {
				label.element.style.opacity = '0';
				continue;
			}

			const x = _projected.x * halfW + halfW;
			const y = -_projected.y * halfH + halfH;

			label.element.style.left = `${x}px`;
			label.element.style.top = `${y}px`;
			label.element.style.opacity = '0.5';
		}
	}

	/** Toggle visibility. */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this.group.visible = visible;
		if (this.labelContainer) {
			this.labelContainer.style.display = visible ? '' : 'none';
		}
	}

	get visible(): boolean {
		return this._visible;
	}

	/** Clean up GPU resources and DOM elements. */
	dispose(): void {
		this.group.removeFromParent();
		for (const g of this.geometries) g.dispose();
		for (const m of this.materials) m.dispose();
		this.labelContainer?.remove();
		this.labels.length = 0;
	}
}
