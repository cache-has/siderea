/**
 * Constellation line and label renderer for the far (stellar) scene.
 *
 * Renders IAU constellation stick figures as Line2 segments connecting
 * real star positions in parsec space. Constellation name labels are
 * HTML overlays projected from 3D center positions.
 *
 * Visibility is distance-gated: constellations are only meaningful when
 * viewed from near Sol. As the camera moves away, the familiar patterns
 * distort — which is intentional and educational — but labels fade out
 * to reduce clutter at distances where the patterns are unrecognizable.
 *
 * Coordinates: far-scene space, 1 unit = 1 parsec (J2000 equatorial).
 */

import { Line2NodeMaterial, Group, Vector3, MathUtils } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import type { Scene, PerspectiveCamera } from 'three/webgpu';
import { float, uniform, Fn } from 'three/tsl';
import type { ConstellationData, Constellation } from '$lib/data/constellations';

export interface ConstellationRendererOptions {
	/** Line width in pixels. @default 1.0 */
	lineWidth?: number;
	/** Base line opacity. @default 0.35 */
	lineOpacity?: number;
	/** Line color (hex). @default 0x4488cc */
	lineColor?: number;
	/** Label color CSS. @default '#6699cc' */
	labelColor?: string;
	/** Distance threshold (parsecs) below which labels are visible. @default 0.5 */
	labelFadeDistance?: number;
	/** Distance threshold (parsecs) below which lines begin to fade. @default 2.0 */
	lineFadeDistance?: number;
}

const DEFAULTS: Required<ConstellationRendererOptions> = {
	lineWidth: 1.0,
	lineOpacity: 0.35,
	lineColor: 0x4488cc,
	labelColor: '#6699cc',
	labelFadeDistance: 0.5,
	lineFadeDistance: 2.0
};

interface LabelEntry {
	constellation: Constellation;
	element: HTMLDivElement;
	position: Vector3;
}

/**
 * Renders constellation stick figures and name labels.
 */
export class ConstellationRenderer {
	private group: Group;
	private materials: Line2NodeMaterial[] = [];
	private geometries: LineGeometry[] = [];
	private opacityUniform: ReturnType<typeof uniform>;
	private _visible = true;
	private _opacity = 1.0;

	// HTML label overlay
	private container: HTMLDivElement | null = null;
	private labels: LabelEntry[] = [];
	private opts: Required<ConstellationRendererOptions>;

	constructor(
		data: ConstellationData,
		canvas: HTMLCanvasElement,
		options: ConstellationRendererOptions = {}
	) {
		this.opts = { ...DEFAULTS, ...options };
		this.group = new Group();
		this.opacityUniform = uniform(this.opts.lineOpacity);

		// Build line geometries — batch all segments per constellation into one geometry
		for (const constellation of data.constellations) {
			if (constellation.lines.length === 0) continue;
			this.createConstellationLines(constellation);
		}

		// Create label overlay container
		this.container = document.createElement('div');
		this.container.style.cssText =
			'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:1';
		canvas.parentElement!.style.position = 'relative';
		canvas.parentElement!.appendChild(this.container);

		// Create labels for each constellation
		for (const constellation of data.constellations) {
			const el = document.createElement('div');
			el.className = 'constellation-label';
			el.textContent = constellation.name;
			el.style.cssText =
				`position:absolute;color:${this.opts.labelColor};font:600 10px/1 system-ui,sans-serif;` +
				'white-space:nowrap;opacity:0;pointer-events:none;' +
				'text-shadow:-1px 0 1px rgba(0,0,0,0.8),1px 0 1px rgba(0,0,0,0.8),0 -1px 1px rgba(0,0,0,0.8),0 1px 1px rgba(0,0,0,0.8);' +
				'background:rgba(10,12,20,0.45);padding:1px 5px;border-radius:3px;' +
				'transform:translate(-50%,-50%);text-transform:uppercase;letter-spacing:0.1em;font-size:9px';
			this.container.appendChild(el);

			const pos = new Vector3(
				constellation.center[0],
				constellation.center[1],
				constellation.center[2]
			);
			this.labels.push({ constellation, element: el, position: pos });
		}
	}

	private createConstellationLines(constellation: Constellation): void {
		const { lineWidth, lineColor } = this.opts;

		// Each line segment is independent (not connected strips), so we create
		// separate Line2 per segment to avoid unwanted connections.
		// However, for efficiency we batch segments that share endpoints into strips
		// where possible. For simplicity, each segment is its own Line2.
		for (const seg of constellation.lines) {
			const positions = [
				seg[0], seg[1], seg[2],
				seg[3], seg[4], seg[5]
			];

			const geo = new LineGeometry();
			geo.setPositions(positions);

			const mat = new Line2NodeMaterial({
				color: lineColor,
				linewidth: lineWidth,
				transparent: true,
				depthWrite: false
			});

			mat.opacityNode = /* @__PURE__ */ Fn(() => {
				return float(this.opacityUniform);
			})();

			const line = new Line2(geo, mat);
			line.computeLineDistances();
			line.renderOrder = -2;

			this.group.add(line);
			this.geometries.push(geo);
			this.materials.push(mat);
		}
	}

	/** Add constellation lines to a scene. */
	addTo(scene: Scene): void {
		scene.add(this.group);
	}

	/** Toggle visibility. */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this.group.visible = visible;
		if (this.container) {
			this.container.style.display = visible ? '' : 'none';
		}
	}

	get visible(): boolean {
		return this._visible;
	}

	/**
	 * Update label positions and distance-based opacity. Call once per frame.
	 * @param camera The far-scene camera (parsec space).
	 * @param canvasWidth Canvas width in CSS pixels.
	 * @param canvasHeight Canvas height in CSS pixels.
	 */
	update(camera: PerspectiveCamera, canvasWidth: number, canvasHeight: number): void {
		if (!this._visible) return;

		const camDist = camera.position.length(); // Distance from Sol in parsecs

		// Fade lines based on distance from Sol
		const lineFade = 1.0 - MathUtils.clamp(
			camDist / this.opts.lineFadeDistance, 0, 1
		);
		this._opacity = lineFade;
		this.opacityUniform.value = this.opts.lineOpacity * lineFade;

		// Update line visibility
		this.group.visible = this._visible && lineFade > 0.01;

		// Update labels
		if (!this.container || lineFade < 0.01) {
			if (this.container) this.container.style.display = 'none';
			return;
		}
		this.container.style.display = '';

		const labelFade = 1.0 - MathUtils.clamp(
			camDist / this.opts.labelFadeDistance, 0, 1
		);

		if (labelFade < 0.01) {
			for (const entry of this.labels) {
				entry.element.style.opacity = '0';
			}
			return;
		}

		const halfW = canvasWidth / 2;
		const halfH = canvasHeight / 2;
		const _projected = new Vector3();

		for (const entry of this.labels) {
			_projected.copy(entry.position).project(camera);

			// Behind camera or outside frustum
			if (_projected.z > 1 || _projected.z < -1 ||
				_projected.x < -1.2 || _projected.x > 1.2 ||
				_projected.y < -1.2 || _projected.y > 1.2) {
				entry.element.style.opacity = '0';
				continue;
			}

			const x = (_projected.x * halfW) + halfW;
			const y = (-_projected.y * halfH) + halfH;

			entry.element.style.left = `${x}px`;
			entry.element.style.top = `${y}px`;
			entry.element.style.opacity = String(Math.min(0.7, labelFade));
		}
	}

	/** Clean up GPU and DOM resources. */
	dispose(): void {
		this.group.removeFromParent();
		for (const g of this.geometries) g.dispose();
		for (const m of this.materials) m.dispose();
		this.container?.remove();
		this.labels.length = 0;
	}
}
