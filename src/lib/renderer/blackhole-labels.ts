/**
 * Black hole label overlay renderer.
 *
 * Projects black hole positions from 3D (parsec space) to screen coordinates
 * and renders HTML labels as a DOM overlay. Same pattern as StarLabelRenderer
 * but for the ~10 black holes in the notable object catalog.
 *
 * Labels show the black hole name and a subtle type indicator (supermassive / stellar).
 * Distance-gated: visible when camera is within ~2× the object's distance from Sol.
 */

import { Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import type { BlackholeNO } from '$lib/data/types';

export interface BlackholeLabelOptions {
	/** Maximum distance (parsecs) at which labels appear. @default 20000 */
	maxLabelDistance?: number;
	/** Maximum visible labels at once. @default 10 */
	maxLabels?: number;
	/** Callback when a label is clicked. */
	onSelect?: (bh: BlackholeNO) => void;
}

const LABEL_DEFAULTS = {
	maxLabelDistance: 20_000,
	maxLabels: 10
};

interface LabelEntry {
	bh: BlackholeNO;
	element: HTMLDivElement;
	position: Vector3;
}

/**
 * Manages HTML overlay labels for black holes.
 */
export class BlackholeLabelRenderer {
	private container: HTMLDivElement;
	private labels: LabelEntry[] = [];
	private opts: Required<Pick<BlackholeLabelOptions, 'maxLabelDistance' | 'maxLabels'>> & {
		onSelect?: (bh: BlackholeNO) => void;
	};
	private _visible = true;

	constructor(
		blackholes: BlackholeNO[],
		canvas: HTMLCanvasElement,
		options: BlackholeLabelOptions = {}
	) {
		const { onSelect, ...rest } = options;
		this.opts = { ...LABEL_DEFAULTS, ...rest, onSelect };

		// Overlay container positioned over the canvas
		this.container = document.createElement('div');
		this.container.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2';
		canvas.parentElement!.style.position = 'relative';
		canvas.parentElement!.appendChild(this.container);

		for (const bh of blackholes) {
			const el = document.createElement('div');
			el.className = 'bh-label';

			const isSM = bh.subtype === 'supermassive';
			const typeTag = isSM ? ' ◉' : ' ●';

			el.textContent = bh.name + typeTag;
			el.style.cssText =
				'position:absolute;color:#e0a060;font:600 11px/1 system-ui,sans-serif;' +
				'white-space:nowrap;opacity:0;transition:opacity 0.15s;pointer-events:none;' +
				'text-shadow:-1px 0 1px rgba(0,0,0,0.8),1px 0 1px rgba(0,0,0,0.8),0 -1px 1px rgba(0,0,0,0.8),0 1px 1px rgba(0,0,0,0.8),0 0 6px rgba(180,100,30,0.4);' +
				'background:rgba(10,12,20,0.55);padding:1px 5px;border-radius:3px;' +
				'transform:translate(10px,-50%);cursor:pointer';
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				this.opts.onSelect?.(bh);
			});
			this.container.appendChild(el);

			const pos = new Vector3(bh.x, bh.y, bh.z);
			this.labels.push({ bh, element: el, position: pos });
		}
	}

	get visible(): boolean {
		return this._visible;
	}

	set visible(v: boolean) {
		this._visible = v;
		this.container.style.display = v ? '' : 'none';
	}

	/**
	 * Update label positions and visibility. Call once per frame.
	 * @param camera The far-scene camera (parsec space).
	 * @param canvasWidth Canvas width in CSS pixels.
	 * @param canvasHeight Canvas height in CSS pixels.
	 */
	update(camera: PerspectiveCamera, canvasWidth: number, canvasHeight: number): void {
		if (!this._visible) return;

		const camPos = camera.position;
		const halfW = canvasWidth / 2;
		const halfH = canvasHeight / 2;
		const { maxLabelDistance, maxLabels } = this.opts;
		const _projected = new Vector3();

		let visibleCount = 0;

		for (const entry of this.labels) {
			if (visibleCount >= maxLabels) {
				entry.element.style.opacity = '0';
				entry.element.style.pointerEvents = 'none';
				continue;
			}

			const dist = entry.position.distanceTo(camPos);

			if (dist > maxLabelDistance) {
				entry.element.style.opacity = '0';
				entry.element.style.pointerEvents = 'none';
				continue;
			}

			// Project to screen
			_projected.copy(entry.position).project(camera);

			if (
				_projected.z > 1 || _projected.z < -1 ||
				_projected.x < -1.1 || _projected.x > 1.1 ||
				_projected.y < -1.1 || _projected.y > 1.1
			) {
				entry.element.style.opacity = '0';
				entry.element.style.pointerEvents = 'none';
				continue;
			}

			const x = _projected.x * halfW + halfW;
			const y = -_projected.y * halfH + halfH;

			entry.element.style.left = `${x}px`;
			entry.element.style.top = `${y}px`;

			// Fade with distance
			const fade = 1.0 - dist / maxLabelDistance;
			const opacity = Math.max(0.3, Math.min(0.9, fade));
			entry.element.style.opacity = String(opacity);
			entry.element.style.pointerEvents = this.opts.onSelect ? 'auto' : 'none';

			visibleCount++;
		}
	}

	/** Clean up DOM elements. */
	dispose(): void {
		this.container.remove();
		this.labels.length = 0;
	}
}
