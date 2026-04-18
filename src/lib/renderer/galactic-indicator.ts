/**
 * Galactic center direction indicator.
 *
 * An HTML overlay that always shows the direction to the galactic center:
 * - When Sgr A* is on-screen: a subtle crosshair marker at its projected position
 * - When Sgr A* is off-screen: an arrow on the viewport edge pointing toward it
 *
 * This provides persistent spatial awareness of galactic orientation regardless
 * of camera direction or zoom level.
 *
 * Coordinates: reads far-scene camera (parsec space).
 */

import { Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { GALACTIC_CENTER_POS } from './galactic-constants';

export interface GalacticIndicatorOptions {
	/** Edge margin in CSS pixels for off-screen arrow. @default 40 */
	edgeMargin?: number;
}

const DEFAULTS = {
	edgeMargin: 40
};

export class GalacticIndicatorRenderer {
	private container: HTMLDivElement;
	private marker: HTMLDivElement;
	private arrow: HTMLDivElement;
	private label: HTMLDivElement;
	private opts: Required<GalacticIndicatorOptions>;
	private _visible = true;
	private readonly targetPos = new Vector3().copy(GALACTIC_CENTER_POS);
	private readonly _projected = new Vector3();

	constructor(canvas: HTMLCanvasElement, options: GalacticIndicatorOptions = {}) {
		this.opts = { ...DEFAULTS, ...options };

		// Container spans the canvas
		this.container = document.createElement('div');
		this.container.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:3';
		canvas.parentElement!.style.position = 'relative';
		canvas.parentElement!.appendChild(this.container);

		// On-screen marker (crosshair + label)
		this.marker = document.createElement('div');
		this.marker.style.cssText =
			'position:absolute;opacity:0;transition:opacity 0.2s;pointer-events:none;' +
			'transform:translate(-50%,-50%)';
		this.marker.innerHTML =
			'<div style="width:16px;height:16px;border:1px solid rgba(255,200,100,0.6);' +
			'border-radius:50%;position:relative">' +
			'<div style="position:absolute;top:50%;left:50%;width:6px;height:6px;' +
			'background:rgba(255,200,100,0.4);border-radius:50%;transform:translate(-50%,-50%)"></div>' +
			'</div>';
		this.container.appendChild(this.marker);

		// On-screen label
		this.label = document.createElement('div');
		this.label.textContent = 'GC';
		this.label.style.cssText =
			'position:absolute;opacity:0;transition:opacity 0.2s;pointer-events:none;' +
			'color:rgba(255,200,100,0.5);font:500 9px/1 system-ui,sans-serif;' +
			'letter-spacing:0.1em;text-transform:uppercase;' +
			'transform:translate(14px,-50%)';
		this.container.appendChild(this.label);

		// Off-screen arrow
		this.arrow = document.createElement('div');
		this.arrow.style.cssText =
			'position:absolute;opacity:0;transition:opacity 0.2s;pointer-events:none;' +
			'width:0;height:0;' +
			'border-left:6px solid transparent;border-right:6px solid transparent;' +
			'border-bottom:10px solid rgba(255,200,100,0.6);' +
			'transform-origin:center center';
		this.container.appendChild(this.arrow);
	}

	get visible(): boolean {
		return this._visible;
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this.container.style.display = visible ? '' : 'none';
	}

	/**
	 * Update indicator position. Call once per frame.
	 */
	update(camera: PerspectiveCamera, canvasWidth: number, canvasHeight: number): void {
		if (!this._visible) return;

		const halfW = canvasWidth / 2;
		const halfH = canvasHeight / 2;
		const margin = this.opts.edgeMargin;

		// Project galactic center to NDC
		this._projected.copy(this.targetPos).project(camera);
		const ndcX = this._projected.x;
		const ndcY = this._projected.y;
		const ndcZ = this._projected.z;

		// Check if on-screen (within NDC cube and in front of camera)
		const onScreen =
			ndcZ > -1 && ndcZ < 1 &&
			ndcX > -1 && ndcX < 1 &&
			ndcY > -1 && ndcY < 1;

		if (onScreen) {
			// Show marker at projected position
			const sx = ndcX * halfW + halfW;
			const sy = -ndcY * halfH + halfH;

			this.marker.style.left = `${sx}px`;
			this.marker.style.top = `${sy}px`;
			this.marker.style.opacity = '0.6';

			this.label.style.left = `${sx}px`;
			this.label.style.top = `${sy}px`;
			this.label.style.opacity = '0.5';

			this.arrow.style.opacity = '0';
		} else {
			// Show arrow on viewport edge
			this.marker.style.opacity = '0';
			this.label.style.opacity = '0';

			// Compute screen-space direction from center to projected point
			// For behind-camera, flip the direction
			let dirX = ndcX;
			let dirY = ndcY;
			if (ndcZ > 1 || ndcZ < -1) {
				// Behind camera — flip
				dirX = -dirX;
				dirY = -dirY;
			}

			// Normalize to find edge intersection
			const len = Math.sqrt(dirX * dirX + dirY * dirY);
			if (len < 0.001) {
				this.arrow.style.opacity = '0';
				return;
			}

			const nx = dirX / len;
			const ny = dirY / len;

			// Find intersection with viewport edges (in NDC-like space, account for margin)
			const marginNdcX = margin / halfW;
			const marginNdcY = margin / halfH;
			const boundX = 1 - marginNdcX;
			const boundY = 1 - marginNdcY;

			let edgeX: number, edgeY: number;
			const tX = Math.abs(nx) > 0.001 ? boundX / Math.abs(nx) : Infinity;
			const tY = Math.abs(ny) > 0.001 ? boundY / Math.abs(ny) : Infinity;
			const t = Math.min(tX, tY);
			edgeX = nx * t;
			edgeY = ny * t;

			// Convert to screen pixels
			const sx = edgeX * halfW + halfW;
			const sy = -edgeY * halfH + halfH;

			// Rotation angle for the arrow (pointing toward galactic center)
			const angle = Math.atan2(-nx, ny); // CSS rotation: 0=up, CW positive
			this.arrow.style.left = `${sx}px`;
			this.arrow.style.top = `${sy}px`;
			this.arrow.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
			this.arrow.style.opacity = '0.5';
		}
	}

	/** Clean up DOM elements. */
	dispose(): void {
		this.container.remove();
	}
}
