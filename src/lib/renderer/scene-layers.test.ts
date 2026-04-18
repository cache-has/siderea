import { describe, it, expect } from 'vitest';
import { Color } from 'three/webgpu';
import { SceneLayer, SceneLayerManager } from './scene-layers';
import { ScaleSpace, AU_PER_PARSEC } from './scale';

describe('SceneLayer', () => {
	it('creates a scene with correct background for BACKGROUND space', () => {
		const layer = new SceneLayer(ScaleSpace.BACKGROUND, 16 / 9);
		expect(layer.scene.background).toBeInstanceOf(Color);
		expect((layer.scene.background as Color).getHex()).toBe(0x000000);
	});

	it('creates a scene with null background for FAR and NEAR', () => {
		const far = new SceneLayer(ScaleSpace.FAR, 1);
		const near = new SceneLayer(ScaleSpace.NEAR, 1);
		expect(far.scene.background).toBeNull();
		expect(near.scene.background).toBeNull();
	});

	it('applies default near/far planes per space', () => {
		const bg = new SceneLayer(ScaleSpace.BACKGROUND, 1);
		expect(bg.camera.near).toBe(0.1);
		expect(bg.camera.far).toBe(10);

		const far = new SceneLayer(ScaleSpace.FAR, 1);
		expect(far.camera.near).toBe(0.01);
		expect(far.camera.far).toBe(100000);

		const near = new SceneLayer(ScaleSpace.NEAR, 1);
		expect(near.camera.near).toBe(0.0001);
		expect(near.camera.far).toBe(300);
	});

	it('allows overriding near/far via config', () => {
		const layer = new SceneLayer(ScaleSpace.NEAR, 1, { near: 1, far: 500 });
		expect(layer.camera.near).toBe(1);
		expect(layer.camera.far).toBe(500);
	});

	it('sets correct aspect ratio', () => {
		const layer = new SceneLayer(ScaleSpace.NEAR, 16 / 9);
		expect(layer.camera.aspect).toBeCloseTo(16 / 9, 5);
	});
});

describe('SceneLayerManager', () => {
	it('creates three layers', () => {
		const mgr = new SceneLayerManager(1);
		expect(mgr.background.space).toBe(ScaleSpace.BACKGROUND);
		expect(mgr.far.space).toBe(ScaleSpace.FAR);
		expect(mgr.near.space).toBe(ScaleSpace.NEAR);
	});

	describe('syncCameras', () => {
		it('copies quaternion from near to far and background', () => {
			const mgr = new SceneLayerManager(1);
			// Rotate the near camera
			mgr.near.camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
			mgr.syncCameras();

			const q = mgr.near.camera.quaternion;
			expect(mgr.far.camera.quaternion.x).toBeCloseTo(q.x, 10);
			expect(mgr.far.camera.quaternion.y).toBeCloseTo(q.y, 10);
			expect(mgr.far.camera.quaternion.z).toBeCloseTo(q.z, 10);
			expect(mgr.far.camera.quaternion.w).toBeCloseTo(q.w, 10);

			expect(mgr.background.camera.quaternion.x).toBeCloseTo(q.x, 10);
			expect(mgr.background.camera.quaternion.y).toBeCloseTo(q.y, 10);
		});

		it('scales far camera position from AU to parsecs', () => {
			const mgr = new SceneLayerManager(1);
			mgr.near.camera.position.set(AU_PER_PARSEC, 0, 0); // 1 parsec in AU
			mgr.syncCameras();

			expect(mgr.far.camera.position.x).toBeCloseTo(1, 6);
			expect(mgr.far.camera.position.y).toBe(0);
			expect(mgr.far.camera.position.z).toBe(0);
		});

		it('keeps background camera at origin', () => {
			const mgr = new SceneLayerManager(1);
			mgr.near.camera.position.set(100, 200, 300);
			mgr.syncCameras();

			expect(mgr.background.camera.position.x).toBe(0);
			expect(mgr.background.camera.position.y).toBe(0);
			expect(mgr.background.camera.position.z).toBe(0);
		});
	});

	describe('setAspect', () => {
		it('updates all three cameras', () => {
			const mgr = new SceneLayerManager(1);
			mgr.setAspect(2.5);

			expect(mgr.background.camera.aspect).toBeCloseTo(2.5);
			expect(mgr.far.camera.aspect).toBeCloseTo(2.5);
			expect(mgr.near.camera.aspect).toBeCloseTo(2.5);
		});
	});

	describe('setFov', () => {
		it('updates all three cameras', () => {
			const mgr = new SceneLayerManager(1);
			mgr.setFov(90);

			expect(mgr.background.camera.fov).toBe(90);
			expect(mgr.far.camera.fov).toBe(90);
			expect(mgr.near.camera.fov).toBe(90);
		});
	});
});
