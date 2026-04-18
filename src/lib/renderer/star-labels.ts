/**
 * Star label overlay renderer.
 *
 * Projects notable star positions from 3D (parsec space) to screen coordinates
 * and renders HTML labels as a DOM overlay. Labels are distance-gated:
 *
 * - Near (<50 pc from camera): show all named stars
 * - Mid (50–500 pc): show only bright stars (apparent mag < 2)
 * - Far (>500 pc): no labels
 *
 * Uses direct Vector3.project() against the far camera — no CSS2DRenderer
 * dependency, minimal overhead for ~200–500 notable stars.
 */

import { Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import type { StarCatalog } from '$lib/data/star-catalog';
import type { NotableStar } from '$lib/data/types';

export interface StarLabelOptions {
	/** Near LOD threshold in parsecs (default: 50). */
	nearThreshold?: number;
	/** Far LOD threshold in parsecs (default: 500). */
	farThreshold?: number;
	/** Max apparent magnitude for mid-distance labels (default: 2.0). */
	midMagLimit?: number;
	/** Maximum number of visible labels at once (default: 60). */
	maxLabels?: number;
	/** Callback when a star label is clicked. */
	onSelect?: (star: NotableStar) => void;
}

const LABEL_DEFAULTS: Required<Pick<StarLabelOptions, 'nearThreshold' | 'farThreshold' | 'midMagLimit' | 'maxLabels'>> = {
	nearThreshold: 50,
	farThreshold: 500,
	midMagLimit: 2.0,
	maxLabels: 60
};

interface LabelEntry {
	star: NotableStar;
	element: HTMLDivElement;
	/** Position in parsecs (cached from catalog). */
	position: Vector3;
}

/**
 * Manages HTML overlay labels for notable stars.
 */
export class StarLabelRenderer {
	private container: HTMLDivElement;
	private labels: LabelEntry[] = [];
	private opts: Required<Pick<StarLabelOptions, 'nearThreshold' | 'farThreshold' | 'midMagLimit' | 'maxLabels'>> & { onSelect?: (star: NotableStar) => void };
	private _visible = true;

	constructor(catalog: StarCatalog, canvas: HTMLCanvasElement, options: StarLabelOptions = {}) {
		const { onSelect, ...rest } = options;
		this.opts = { ...LABEL_DEFAULTS, ...rest, onSelect };

		// Create overlay container positioned over the canvas
		this.container = document.createElement('div');
		this.container.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:1';
		canvas.parentElement!.style.position = 'relative';
		canvas.parentElement!.appendChild(this.container);

		// Create a label element for each notable star
		for (const star of catalog.notable) {
			const el = document.createElement('div');
			el.className = 'star-label';
			el.textContent = star.name;
			el.style.cssText =
				'position:absolute;color:#c8d0e0;font:500 11px/1 system-ui,sans-serif;' +
				'white-space:nowrap;opacity:0;transition:opacity 0.15s;pointer-events:none;' +
				'text-shadow:-1px 0 1px rgba(0,0,0,0.8),1px 0 1px rgba(0,0,0,0.8),0 -1px 1px rgba(0,0,0,0.8),0 1px 1px rgba(0,0,0,0.8),0 0 6px rgba(0,0,0,0.5);' +
				'background:rgba(10,12,20,0.55);padding:1px 5px;border-radius:3px;' +
				'transform:translate(8px,-50%);cursor:pointer';
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				this.opts.onSelect?.(star);
			});
			this.container.appendChild(el);

			const pos = new Vector3(
				catalog.data.positions[star.index * 3],
				catalog.data.positions[star.index * 3 + 1],
				catalog.data.positions[star.index * 3 + 2]
			);

			this.labels.push({ star, element: el, position: pos });
		}
	}

	get visible(): boolean {
		return this._visible;
	}

	set visible(v: boolean) {
		this._visible = v;
		this.container.style.display = v ? '' : 'none';
	}

	/** Update label density parameters at runtime. */
	setLabelDensity(opts: { nearThreshold?: number; farThreshold?: number; midMagLimit?: number; maxLabels?: number }): void {
		if (opts.nearThreshold !== undefined) this.opts.nearThreshold = opts.nearThreshold;
		if (opts.farThreshold !== undefined) this.opts.farThreshold = opts.farThreshold;
		if (opts.midMagLimit !== undefined) this.opts.midMagLimit = opts.midMagLimit;
		if (opts.maxLabels !== undefined) this.opts.maxLabels = opts.maxLabels;
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

		const { nearThreshold, farThreshold, midMagLimit, maxLabels } = this.opts;
		const _projected = new Vector3();

		let visibleCount = 0;

		for (const entry of this.labels) {
			if (visibleCount >= maxLabels) {
				entry.element.style.opacity = '0';
				continue;
			}

			// Distance from camera to star (parsecs)
			const dist = entry.position.distanceTo(camPos);

			// LOD visibility gate
			let show = false;
			if (dist < nearThreshold) {
				show = true; // Near: show all named stars
			} else if (dist < farThreshold) {
				show = entry.star.mag <= midMagLimit; // Mid: only bright stars
			}
			// Far (>farThreshold): no labels

			if (!show) {
				entry.element.style.opacity = '0';
				entry.element.style.pointerEvents = 'none';
				continue;
			}

			// Project to screen
			_projected.copy(entry.position).project(camera);

			// Behind camera or outside frustum
			if (_projected.z > 1 || _projected.z < -1 ||
				_projected.x < -1.1 || _projected.x > 1.1 ||
				_projected.y < -1.1 || _projected.y > 1.1) {
				entry.element.style.opacity = '0';
				entry.element.style.pointerEvents = 'none';
				continue;
			}

			// NDC → CSS pixels
			const x = (_projected.x * halfW) + halfW;
			const y = (-_projected.y * halfH) + halfH;

			entry.element.style.left = `${x}px`;
			entry.element.style.top = `${y}px`;

			// Fade based on distance: full opacity at 0, fades near threshold boundary
			const distFade = dist < nearThreshold
				? 1.0
				: 1.0 - (dist - nearThreshold) / (farThreshold - nearThreshold);
			const opacity = Math.max(0.3, Math.min(0.9, distFade));
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
