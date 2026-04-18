/**
 * Star cluster label overlay renderer.
 *
 * Projects cluster positions from 3D (parsec space) to screen coordinates
 * and renders HTML labels as a DOM overlay. Same pattern as NebulaLabelRenderer.
 *
 * Labels show the cluster name with a subtype-colored indicator.
 * Distance-gated: visible when camera is within maxLabelDistance.
 */

import { Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import type { ClusterNO, ClusterSubtype } from '$lib/data/types';

export interface ClusterLabelOptions {
	/** Maximum distance (parsecs) at which labels appear. @default 30000 */
	maxLabelDistance?: number;
	/** Maximum visible labels at once. @default 30 */
	maxLabels?: number;
	/** Callback when a label is clicked. */
	onSelect?: (cluster: ClusterNO) => void;
}

const LABEL_DEFAULTS = {
	maxLabelDistance: 30_000,
	maxLabels: 30
};

/** Label colors by subtype. */
const SUBTYPE_COLORS: Record<ClusterSubtype, string> = {
	open: '#e0b860',
	globular: '#a0a0e0'
};

const SUBTYPE_ICONS: Record<ClusterSubtype, string> = {
	open: '\u2734',     // ✴ eight-pointed star
	globular: '\u25C9'  // ◉ fisheye
};

interface LabelEntry {
	cluster: ClusterNO;
	element: HTMLDivElement;
	position: Vector3;
}

/**
 * Manages HTML overlay labels for star clusters.
 */
export class ClusterLabelRenderer {
	private container: HTMLDivElement;
	private labels: LabelEntry[] = [];
	private opts: Required<Pick<ClusterLabelOptions, 'maxLabelDistance' | 'maxLabels'>> & {
		onSelect?: (cluster: ClusterNO) => void;
	};
	private _visible = true;

	constructor(
		clusters: ClusterNO[],
		canvas: HTMLCanvasElement,
		options: ClusterLabelOptions = {}
	) {
		const { onSelect, ...rest } = options;
		this.opts = { ...LABEL_DEFAULTS, ...rest, onSelect };

		this.container = document.createElement('div');
		this.container.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2';
		canvas.parentElement!.style.position = 'relative';
		canvas.parentElement!.appendChild(this.container);

		for (const cluster of clusters) {
			const el = document.createElement('div');
			el.className = 'cluster-label';

			const color = SUBTYPE_COLORS[cluster.subtype] ?? '#c0c0c0';
			const icon = SUBTYPE_ICONS[cluster.subtype] ?? '\u2734';

			el.textContent = `${cluster.name} ${icon}`;
			el.style.cssText =
				`position:absolute;color:${color};font:600 11px/1 system-ui,sans-serif;` +
				'white-space:nowrap;opacity:0;transition:opacity 0.15s;pointer-events:none;' +
				`text-shadow:-1px 0 1px rgba(0,0,0,0.8),1px 0 1px rgba(0,0,0,0.8),0 -1px 1px rgba(0,0,0,0.8),0 1px 1px rgba(0,0,0,0.8),0 0 6px ${color}40;` +
				'background:rgba(10,12,20,0.55);padding:1px 5px;border-radius:3px;' +
				'transform:translate(10px,-50%);cursor:pointer';
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				this.opts.onSelect?.(cluster);
			});
			this.container.appendChild(el);

			const pos = new Vector3(cluster.x, cluster.y, cluster.z);
			this.labels.push({ cluster, element: el, position: pos });
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
