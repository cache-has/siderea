/**
 * Multi-scale scene layer management.
 *
 * Three independent scene layers, each with its own Scene + PerspectiveCamera:
 * - Background: skybox / galactic backdrop (near=0.1, far=10)
 * - Far: stars and deep space objects in parsecs (near=0.01, far=100000)
 * - Near: solar system objects in AU (near=0.0001, far=300)
 *
 * Cameras share orientation (quaternion) with the primary (near) camera.
 * Far camera position is derived from near camera position via AU→parsec conversion.
 * Background camera stays at origin.
 */

import { Scene, PerspectiveCamera, Color } from 'three/webgpu';
import { AU_PER_PARSEC, ScaleSpace } from './scale';

export interface SceneLayerConfig {
	near: number;
	far: number;
	fov?: number;
	background?: Color | null;
}

const LAYER_DEFAULTS: Record<ScaleSpace, SceneLayerConfig> = {
	[ScaleSpace.BACKGROUND]: { near: 0.1, far: 10, background: new Color(0x000000) },
	[ScaleSpace.FAR]: { near: 0.01, far: 100000, background: null },
	[ScaleSpace.NEAR]: { near: 0.0001, far: 300, background: null }
};

export class SceneLayer {
	readonly scene: Scene;
	readonly camera: PerspectiveCamera;
	readonly space: ScaleSpace;

	constructor(space: ScaleSpace, aspect: number, config?: Partial<SceneLayerConfig>) {
		this.space = space;
		const defaults = LAYER_DEFAULTS[space];
		const near = config?.near ?? defaults.near;
		const far = config?.far ?? defaults.far;
		const fov = config?.fov ?? 60;
		const bg = config?.background !== undefined ? config.background : defaults.background;

		this.scene = new Scene();
		this.scene.background = bg ?? null;

		this.camera = new PerspectiveCamera(fov, aspect, near, far);
	}
}

export class SceneLayerManager {
	readonly background: SceneLayer;
	readonly far: SceneLayer;
	readonly near: SceneLayer;

	constructor(aspect: number) {
		this.background = new SceneLayer(ScaleSpace.BACKGROUND, aspect);
		this.far = new SceneLayer(ScaleSpace.FAR, aspect);
		this.near = new SceneLayer(ScaleSpace.NEAR, aspect);
	}

	/**
	 * Synchronize far and background cameras from the near (primary) camera.
	 * Call this each frame after updating the near camera.
	 *
	 * - All cameras share the near camera's quaternion (orientation).
	 * - Far camera position = near camera position / AU_PER_PARSEC.
	 * - Background camera stays at origin.
	 */
	syncCameras(): void {
		const primary = this.near.camera;

		// Far camera: same orientation, position scaled from AU to parsecs
		this.far.camera.quaternion.copy(primary.quaternion);
		this.far.camera.position
			.copy(primary.position)
			.multiplyScalar(1 / AU_PER_PARSEC);

		// Background camera: same orientation, fixed at origin
		this.background.camera.quaternion.copy(primary.quaternion);
		this.background.camera.position.set(0, 0, 0);
	}

	/** Update aspect ratio on all cameras. */
	setAspect(aspect: number): void {
		for (const layer of [this.background, this.far, this.near]) {
			layer.camera.aspect = aspect;
			layer.camera.updateProjectionMatrix();
		}
	}

	/** Update FOV on all cameras. */
	setFov(fov: number): void {
		for (const layer of [this.background, this.far, this.near]) {
			layer.camera.fov = fov;
			layer.camera.updateProjectionMatrix();
		}
	}

	/** Update clip planes for a specific scene layer. */
	setClipPlanes(space: ScaleSpace, near: number, far: number): void {
		const layer = this.getLayer(space);
		layer.camera.near = near;
		layer.camera.far = far;
		layer.camera.updateProjectionMatrix();
	}

	/** Get clip planes for a specific scene layer. */
	getClipPlanes(space: ScaleSpace): { near: number; far: number } {
		const layer = this.getLayer(space);
		return { near: layer.camera.near, far: layer.camera.far };
	}

	private getLayer(space: ScaleSpace): SceneLayer {
		switch (space) {
			case ScaleSpace.NEAR:
				return this.near;
			case ScaleSpace.FAR:
				return this.far;
			case ScaleSpace.BACKGROUND:
				return this.background;
		}
	}
}
