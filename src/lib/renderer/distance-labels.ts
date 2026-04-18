/**
 * Distance label overlay renderer.
 *
 * Shows distance measurements between pairs of solar system objects as
 * HTML overlay lines + text. Pairs are parent-child relationships
 * (Sun→planet, planet→moon) with LOD gating based on camera distance
 * to avoid clutter.
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 */

import { Vector3 } from 'three/webgpu';
import type { PerspectiveCamera, Mesh } from 'three/webgpu';
import { METERS_PER_AU } from './scale';

export interface DistancePair {
	/** Display name for the first object. */
	nameA: string;
	/** Display name for the second object. */
	nameB: string;
	/** Getter for object A's world position (AU). Returns null if unavailable. */
	getPositionA: () => Vector3 | null;
	/** Getter for object B's world position (AU). Returns null if unavailable. */
	getPositionB: () => Vector3 | null;
	/**
	 * Maximum camera distance (AU) from the midpoint of this pair
	 * at which the label is shown. Prevents clutter at extreme zoom levels.
	 */
	maxCameraDistance: number;
}

export interface DistanceLabelOptions {
	/** Maximum number of visible labels at once. @default 12 */
	maxLabels?: number;
	/** Line color CSS. @default 'rgba(120, 160, 200, 0.3)' */
	lineColor?: string;
	/** Text color CSS. @default '#a0b8d0' */
	textColor?: string;
}

const DEFAULTS: Required<DistanceLabelOptions> = {
	maxLabels: 12,
	lineColor: 'rgba(120, 160, 200, 0.3)',
	textColor: '#a0b8d0'
};

interface LabelEntry {
	pair: DistancePair;
	line: SVGLineElement;
	text: HTMLDivElement;
}

const _projected = new Vector3();
const _posA = new Vector3();
const _posB = new Vector3();
const _midpoint = new Vector3();

/** Format a distance in AU to human-readable units. */
function formatDistance(au: number): string {
	const km = au * (METERS_PER_AU / 1000);
	if (km < 1) {
		return `${(km * 1000).toFixed(0)} m`;
	}
	if (km < 1_000_000) {
		return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
	}
	if (au < 0.1) {
		return `${(km / 1e6).toFixed(2)} M km`;
	}
	if (au < 100) {
		return `${au.toFixed(3)} AU`;
	}
	return `${au.toFixed(1)} AU`;
}

/**
 * Renders distance labels between pairs of solar system objects.
 */
export class DistanceLabelRenderer {
	private container: HTMLDivElement;
	private svg: SVGSVGElement;
	private labels: LabelEntry[] = [];
	private opts: Required<DistanceLabelOptions>;
	private _visible = false; // off by default

	constructor(canvas: HTMLCanvasElement, options: DistanceLabelOptions = {}) {
		this.opts = { ...DEFAULTS, ...options };

		// Create overlay container
		this.container = document.createElement('div');
		this.container.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2';
		this.container.style.display = 'none'; // hidden by default

		// SVG layer for connector lines
		this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.svg.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
		this.container.appendChild(this.svg);

		canvas.parentElement!.style.position = 'relative';
		canvas.parentElement!.appendChild(this.container);
	}

	/** Register a pair of objects to show distance between. */
	addPair(pair: DistancePair): void {
		const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		line.setAttribute('stroke', this.opts.lineColor);
		line.setAttribute('stroke-width', '1');
		line.setAttribute('stroke-dasharray', '4 3');
		line.style.opacity = '0';
		this.svg.appendChild(line);

		const text = document.createElement('div');
		text.style.cssText =
			`position:absolute;color:${this.opts.textColor};font:400 9px/1 system-ui,sans-serif;` +
			'white-space:nowrap;opacity:0;transition:opacity 0.15s;pointer-events:none;' +
			'text-shadow:0 0 4px rgba(0,0,0,0.9),0 0 8px rgba(0,0,0,0.5);' +
			'transform:translate(-50%,-50%);letter-spacing:0.04em;' +
			'background:rgba(10,12,20,0.5);padding:1px 4px;border-radius:2px';
		this.container.appendChild(text);

		this.labels.push({ pair, line, text });
	}

	/** Remove all registered pairs. */
	clearPairs(): void {
		for (const entry of this.labels) {
			entry.line.remove();
			entry.text.remove();
		}
		this.labels.length = 0;
	}

	/**
	 * Update label positions. Call once per frame.
	 */
	update(camera: PerspectiveCamera, canvasWidth: number, canvasHeight: number): void {
		if (!this._visible) return;

		const halfW = canvasWidth / 2;
		const halfH = canvasHeight / 2;
		let visibleCount = 0;

		for (const entry of this.labels) {
			if (visibleCount >= this.opts.maxLabels) {
				entry.line.style.opacity = '0';
				entry.text.style.opacity = '0';
				continue;
			}

			const posA = entry.pair.getPositionA();
			const posB = entry.pair.getPositionB();

			if (!posA || !posB) {
				entry.line.style.opacity = '0';
				entry.text.style.opacity = '0';
				continue;
			}

			// Check camera distance from midpoint
			_midpoint.copy(posA).add(posB).multiplyScalar(0.5);
			const camDist = camera.position.distanceTo(_midpoint);

			if (camDist > entry.pair.maxCameraDistance) {
				entry.line.style.opacity = '0';
				entry.text.style.opacity = '0';
				continue;
			}

			// Project both endpoints to screen
			_projected.copy(posA).project(camera);
			const onScreenA =
				_projected.z > 0 && _projected.z < 1 &&
				_projected.x >= -1.2 && _projected.x <= 1.2 &&
				_projected.y >= -1.2 && _projected.y <= 1.2;
			const ax = _projected.x * halfW + halfW;
			const ay = -_projected.y * halfH + halfH;

			_projected.copy(posB).project(camera);
			const onScreenB =
				_projected.z > 0 && _projected.z < 1 &&
				_projected.x >= -1.2 && _projected.x <= 1.2 &&
				_projected.y >= -1.2 && _projected.y <= 1.2;
			const bx = _projected.x * halfW + halfW;
			const by = -_projected.y * halfH + halfH;

			// Need at least one endpoint on screen
			if (!onScreenA && !onScreenB) {
				entry.line.style.opacity = '0';
				entry.text.style.opacity = '0';
				continue;
			}

			// Compute distance between objects
			const dist = posA.distanceTo(posB);

			// Skip if objects are too close in screen space (labels would overlap)
			const screenDist = Math.hypot(bx - ax, by - ay);
			if (screenDist < 30) {
				entry.line.style.opacity = '0';
				entry.text.style.opacity = '0';
				continue;
			}

			// Fade based on camera distance (closer = more opaque)
			const distRatio = camDist / entry.pair.maxCameraDistance;
			const opacity = Math.max(0.2, Math.min(0.7, 1.0 - distRatio));

			// Update line
			entry.line.setAttribute('x1', ax.toFixed(1));
			entry.line.setAttribute('y1', ay.toFixed(1));
			entry.line.setAttribute('x2', bx.toFixed(1));
			entry.line.setAttribute('y2', by.toFixed(1));
			entry.line.style.opacity = String(opacity * 0.6);

			// Update text at midpoint
			const mx = (ax + bx) / 2;
			const my = (ay + by) / 2;
			entry.text.textContent = formatDistance(dist);
			entry.text.style.left = `${mx}px`;
			entry.text.style.top = `${my}px`;
			entry.text.style.opacity = String(opacity);

			visibleCount++;
		}
	}

	/** Toggle visibility. */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this.container.style.display = visible ? '' : 'none';
		if (!visible) {
			for (const entry of this.labels) {
				entry.line.style.opacity = '0';
				entry.text.style.opacity = '0';
			}
		}
	}

	get visible(): boolean {
		return this._visible;
	}

	/** Clean up DOM elements. */
	dispose(): void {
		this.container.remove();
		this.labels.length = 0;
	}
}

/**
 * Helper: create a position getter from a mesh reference.
 * Returns null if the mesh doesn't exist.
 */
export function meshPositionGetter(getMesh: () => Mesh | undefined): () => Vector3 | null {
	const _pos = new Vector3();
	return () => {
		const mesh = getMesh();
		return mesh ? mesh.getWorldPosition(_pos) : null;
	};
}

/**
 * Helper: create a position getter that returns the origin (for the Sun).
 */
export function originPositionGetter(): () => Vector3 {
	const _origin = new Vector3(0, 0, 0);
	return () => _origin;
}
