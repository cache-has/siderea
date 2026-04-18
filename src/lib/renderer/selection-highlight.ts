/**
 * Selection highlight — visual feedback for the currently selected object.
 *
 * Renders a pulsing wireframe sphere around the selected mesh,
 * slightly larger than the object to create an outline effect.
 */

import {
	SphereGeometry,
	Mesh,
	MeshBasicMaterial,
	Color,
	AdditiveBlending,
	FrontSide
} from 'three/webgpu';
import type { Scene, Object3D } from 'three/webgpu';

export interface SelectionHighlightOptions {
	/** Highlight color. @default 0x4090ff */
	color?: number;
	/** Scale multiplier over the target mesh. @default 1.08 */
	scaleFactor?: number;
	/** Base opacity of the highlight. @default 0.25 */
	opacity?: number;
	/** Pulse speed in radians/second. @default 3 */
	pulseSpeed?: number;
}

const DEFAULTS = {
	color: 0x4090ff,
	scaleFactor: 1.08,
	opacity: 0.25,
	pulseSpeed: 3
};

export class SelectionHighlight {
	private mesh: Mesh;
	private geometry: SphereGeometry;
	private material: MeshBasicMaterial;
	private scene: Scene;
	private target: Object3D | null = null;
	private elapsed = 0;
	private scaleFactor: number;
	private baseOpacity: number;
	private pulseSpeed: number;

	constructor(scene: Scene, options: SelectionHighlightOptions = {}) {
		this.scene = scene;
		this.scaleFactor = options.scaleFactor ?? DEFAULTS.scaleFactor;
		this.baseOpacity = options.opacity ?? DEFAULTS.opacity;
		this.pulseSpeed = options.pulseSpeed ?? DEFAULTS.pulseSpeed;

		// Use a unit sphere; we'll scale it to match the target
		this.geometry = new SphereGeometry(1, 32, 32);
		this.material = new MeshBasicMaterial({
			color: new Color(options.color ?? DEFAULTS.color),
			transparent: true,
			opacity: this.baseOpacity,
			wireframe: true,
			blending: AdditiveBlending,
			side: FrontSide,
			depthWrite: false
		});

		this.mesh = new Mesh(this.geometry, this.material);
		this.mesh.visible = false;
		this.mesh.renderOrder = 999;
		this.scene.add(this.mesh);
	}

	/**
	 * Set the target object to highlight. Pass null to hide.
	 * @param target The 3D object to highlight.
	 * @param radius Radius of the object in scene units (AU).
	 */
	setTarget(target: Object3D | null, radius = 0): void {
		this.target = target;
		if (target && radius > 0) {
			const s = radius * this.scaleFactor;
			this.mesh.scale.set(s, s, s);
			this.mesh.visible = true;
		} else {
			this.mesh.visible = false;
		}
	}

	/** Update highlight position and pulse. Call once per frame. */
	update(delta: number): void {
		if (!this.target || !this.mesh.visible) return;

		this.elapsed += delta;

		// Track target position
		this.target.getWorldPosition(this.mesh.position);

		// Subtle pulse
		const pulse = 0.7 + 0.3 * Math.sin(this.elapsed * this.pulseSpeed);
		this.material.opacity = this.baseOpacity * pulse;
	}

	/** Hide the highlight. */
	hide(): void {
		this.mesh.visible = false;
		this.target = null;
	}

	dispose(): void {
		this.mesh.removeFromParent();
		this.geometry.dispose();
		this.material.dispose();
	}
}
