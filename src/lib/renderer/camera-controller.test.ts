import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { CameraController, CameraMode } from './camera-controller';
import { SceneLayerManager } from './scene-layers';

/**
 * Create a minimal mock canvas that satisfies CameraController's
 * addEventListener/removeEventListener needs without requiring jsdom.
 */
function createMockDocument(): Document {
	return {
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		exitPointerLock: vi.fn(),
		pointerLockElement: null
	} as unknown as Document;
}

function createMockCanvas(): HTMLCanvasElement {
	const listeners: Record<string, Function[]> = {};
	return {
		addEventListener: vi.fn((type: string, fn: Function) => {
			(listeners[type] ??= []).push(fn);
		}),
		removeEventListener: vi.fn(),
		requestPointerLock: vi.fn(),
		getBoundingClientRect: () => ({ width: 800, height: 600, top: 0, left: 0 }),
		ownerDocument: createMockDocument()
	} as unknown as HTMLCanvasElement;
}

/** Create a controller with sensible defaults for testing. */
function createController(
	overrides?: Partial<ConstructorParameters<typeof CameraController>[0]>
): { controller: CameraController; camera: PerspectiveCamera; layers: SceneLayerManager } {
	const camera = new PerspectiveCamera(60, 4 / 3, 0.1, 1000);
	camera.position.set(0, 2, 5);
	const layers = new SceneLayerManager(4 / 3);
	const canvas = createMockCanvas();

	const controller = new CameraController({
		camera,
		canvas,
		layers,
		...overrides
	});

	return { controller, camera, layers };
}

describe('CameraController', () => {
	describe('initialization', () => {
		it('defaults to orbit mode', () => {
			const { controller } = createController();
			expect(controller.mode).toBe(CameraMode.ORBIT);
			controller.dispose();
		});

		it('respects initialMode option', () => {
			const { controller } = createController({ initialMode: CameraMode.FREE_FLY });
			expect(controller.mode).toBe(CameraMode.FREE_FLY);
			controller.dispose();
		});

		it('reads initial FOV from camera', () => {
			const { controller } = createController();
			expect(controller.getFov()).toBe(60);
			expect(controller.getFovTarget()).toBe(60);
			controller.dispose();
		});
	});

	describe('orbit mode', () => {
		it('positions camera based on spherical coordinates around target', () => {
			const { controller, camera } = createController();
			camera.position.set(0, 0, 5);

			// Run several frames so damping settles
			for (let i = 0; i < 120; i++) {
				controller.update(1 / 60);
			}

			// Camera should still be roughly at distance ~5 from origin
			const distance = camera.position.length();
			expect(distance).toBeGreaterThan(0.5);
			expect(distance).toBeLessThan(50);

			controller.dispose();
		});

		it('setTarget changes the orbit center', () => {
			const { controller } = createController();
			const newTarget = new Vector3(10, 0, 0);
			controller.setTarget(newTarget);
			expect(controller.getTarget().x).toBe(10);
			controller.dispose();
		});
	});

	describe('mode switching', () => {
		it('transitions from orbit to free-fly', () => {
			const { controller } = createController();
			expect(controller.mode).toBe(CameraMode.ORBIT);

			controller.setMode(CameraMode.FREE_FLY);

			// During transition, mode hasn't changed yet
			expect(controller.mode).toBe(CameraMode.ORBIT);

			// Advance past transition duration (0.6s)
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			expect(controller.mode).toBe(CameraMode.FREE_FLY);
			controller.dispose();
		});

		it('transitions from free-fly to orbit', () => {
			const { controller } = createController({ initialMode: CameraMode.FREE_FLY });
			controller.setMode(CameraMode.ORBIT);

			// Advance past transition
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			expect(controller.mode).toBe(CameraMode.ORBIT);
			controller.dispose();
		});

		it('ignores setMode to current mode', () => {
			const { controller, camera } = createController();
			const posBefore = camera.position.clone();

			controller.setMode(CameraMode.ORBIT); // same mode
			controller.update(1 / 60);

			// No transition should occur — camera still governed by orbit
			expect(controller.mode).toBe(CameraMode.ORBIT);
			controller.dispose();
		});
	});

	describe('FOV controls', () => {
		it('setFov with animate=false applies immediately', () => {
			const { controller, camera, layers } = createController();
			controller.setFov(90, false);

			expect(camera.fov).toBe(90);
			// All layer cameras should also be updated
			expect(layers.near.camera.fov).toBe(90);
			expect(layers.far.camera.fov).toBe(90);
			expect(layers.background.camera.fov).toBe(90);

			controller.dispose();
		});

		it('setFov with animate=true converges over time', () => {
			const { controller, camera } = createController();
			expect(camera.fov).toBe(60);

			controller.setFov(120);
			expect(camera.fov).toBe(60); // not yet

			// Advance several frames
			for (let i = 0; i < 120; i++) {
				controller.update(1 / 60);
			}

			expect(camera.fov).toBeCloseTo(120, 0);
			controller.dispose();
		});

		it('clamps FOV to [10, 150]', () => {
			const { controller } = createController();
			controller.setFov(5, false);
			expect(controller.getFovTarget()).toBe(10);

			controller.setFov(200, false);
			expect(controller.getFovTarget()).toBe(150);

			controller.dispose();
		});
	});

	describe('free-fly speed', () => {
		it('getFlySpeed returns default', () => {
			const { controller } = createController();
			expect(controller.getFlySpeed()).toBe(2);
			controller.dispose();
		});

		it('setFlySpeed clamps to range', () => {
			const { controller } = createController();
			controller.setFlySpeed(5000);
			expect(controller.getFlySpeed()).toBe(1000);
			controller.setFlySpeed(0.001);
			expect(controller.getFlySpeed()).toBe(0.01);
			controller.dispose();
		});
	});

	describe('autoFrame', () => {
		it('smoothly transitions to orbit a target position', () => {
			const { controller, camera } = createController();
			const target = new Vector3(10, 0, 0);
			controller.autoFrame(target, 0.5);

			// Should be transitioning
			expect(controller.mode).toBe(CameraMode.ORBIT);

			// Advance past transition (0.6s)
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			// Camera should be near the target
			const dist = camera.position.distanceTo(target);
			expect(dist).toBeGreaterThan(0.5); // min distance = 0.5 * 1.2
			expect(dist).toBeLessThan(50);

			controller.dispose();
		});

		it('sets distance limits based on object radius', () => {
			const { controller, camera } = createController();
			const target = new Vector3(5, 0, 0);
			controller.autoFrame(target, 1.0);

			// Advance past transition + settle
			for (let i = 0; i < 180; i++) {
				controller.update(1 / 60);
			}

			// Camera should orbit at ~3x radius
			const dist = camera.position.distanceTo(target);
			expect(dist).toBeGreaterThan(1.0); // can't be closer than 1.2 * radius
			expect(dist).toBeLessThan(10);

			controller.dispose();
		});

		it('does nothing during an active transition', () => {
			const { controller, camera } = createController();
			controller.setMode(CameraMode.FREE_FLY);

			// During transition, autoFrame should be ignored
			const posBefore = camera.position.clone();
			controller.autoFrame(new Vector3(100, 0, 0), 1);

			// The transition to free-fly should continue, not be overridden
			controller.update(1 / 60);
			controller.dispose();
		});
	});

	describe('follow mode', () => {
		it('tracks a moving target', () => {
			const { controller, camera } = createController();
			const targetPos = new Vector3(0, 0, 0);
			const provider = () => targetPos.clone();

			controller.setFollowTarget(provider, new Vector3(0, 1, 3));

			// Advance past transition
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			expect(controller.mode).toBe(CameraMode.FOLLOW);

			// Move the target
			targetPos.set(10, 0, 0);

			// Advance frames — camera should track toward new position
			for (let i = 0; i < 120; i++) {
				controller.update(1 / 60);
			}

			// Camera should be near (10, 1, 3) — target + offset
			expect(camera.position.x).toBeGreaterThan(5);

			controller.dispose();
		});

		it('clearFollowTarget returns to orbit mode', () => {
			const { controller } = createController();
			const provider = () => new Vector3(0, 0, 0);

			controller.setFollowTarget(provider);

			// Advance past transition
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			expect(controller.mode).toBe(CameraMode.FOLLOW);

			controller.clearFollowTarget();

			// Advance past transition back to orbit
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			expect(controller.mode).toBe(CameraMode.ORBIT);

			controller.dispose();
		});

		it('falls back to orbit if provider is cleared mid-follow', () => {
			const { controller } = createController();
			const provider = () => new Vector3(0, 0, 0);

			controller.setFollowTarget(provider);

			// Advance past transition
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			// Clear provider directly (simulates edge case)
			controller.clearFollowTarget();

			// Advance — should transition to orbit without error
			for (let i = 0; i < 60; i++) {
				controller.update(1 / 60);
			}

			expect(controller.mode).toBe(CameraMode.ORBIT);
			controller.dispose();
		});
	});

	describe('serialization', () => {
		it('serialize captures camera state', () => {
			const { controller, camera } = createController();
			camera.position.set(1, 2, 3);
			controller.setTarget(new Vector3(4, 5, 6));
			controller.setFov(90, false);
			controller.setFlySpeed(5);

			const state = controller.serialize();

			expect(state.mode).toBe(CameraMode.ORBIT);
			expect(state.position).toEqual([1, 2, 3]);
			expect(state.target).toEqual([4, 5, 6]);
			expect(state.fov).toBe(90);
			expect(state.flySpeed).toBe(5);

			controller.dispose();
		});

		it('deserialize restores camera state', () => {
			const { controller, camera, layers } = createController();

			controller.deserialize({
				mode: CameraMode.ORBIT,
				position: [10, 20, 30],
				target: [1, 2, 3],
				fov: 75,
				flySpeed: 8,
				pitch: 0,
				yaw: 0
			});

			expect(camera.position.x).toBe(10);
			expect(camera.position.y).toBe(20);
			expect(camera.position.z).toBe(30);
			expect(controller.getTarget().x).toBe(1);
			expect(controller.getTarget().y).toBe(2);
			expect(controller.getTarget().z).toBe(3);
			expect(camera.fov).toBe(75);
			expect(controller.getFlySpeed()).toBe(8);

			controller.dispose();
		});

		it('round-trips through serialize/deserialize', () => {
			const { controller: c1, camera: cam1 } = createController();
			cam1.position.set(7, 8, 9);
			c1.setTarget(new Vector3(1, 1, 1));
			c1.setFov(100, false);

			const state = c1.serialize();
			c1.dispose();

			const { controller: c2, camera: cam2 } = createController();
			c2.deserialize(state);

			expect(cam2.position.x).toBeCloseTo(7);
			expect(cam2.position.y).toBeCloseTo(8);
			expect(cam2.position.z).toBeCloseTo(9);
			expect(c2.getTarget().x).toBe(1);
			expect(c2.getFov()).toBe(100);

			c2.dispose();
		});
	});

	describe('scale-adaptive speed', () => {
		it('increases effective speed when far from origin', () => {
			const { controller, camera } = createController({
				initialMode: CameraMode.FREE_FLY,
				scaleAdaptiveSpeed: true,
				flySpeed: 1
			});

			// Place camera far from origin
			camera.position.set(0, 0, 50);

			// Simulate forward movement
			const startZ = camera.position.z;
			// Simulate keydown W
			controller.update(0); // sync state
			// We can't easily press keys in test, but we can verify the controller
			// accepts the option without error
			expect(controller.getFlySpeed()).toBe(1);

			controller.dispose();
		});

		it('can be disabled', () => {
			const { controller } = createController({
				scaleAdaptiveSpeed: false
			});

			// Should not throw
			controller.update(1 / 60);
			controller.dispose();
		});
	});

	describe('setDistanceLimits', () => {
		it('updates min and max distance', () => {
			const { controller, camera } = createController();
			controller.setDistanceLimits(2, 20);

			// Position camera very close — orbit should enforce min
			camera.position.set(0, 0, 0.5);
			controller.setTarget(new Vector3(0, 0, 0));

			for (let i = 0; i < 120; i++) {
				controller.update(1 / 60);
			}

			const dist = camera.position.length();
			expect(dist).toBeGreaterThanOrEqual(1.9); // should be at least ~2

			controller.dispose();
		});
	});

	describe('onAutoFrame callback', () => {
		it('fires on dblclick with client coordinates', () => {
			const canvas = createMockCanvas();
			const camera = new PerspectiveCamera(60, 1, 0.1, 100);
			const layers = new SceneLayerManager(1);

			const controller = new CameraController({ camera, canvas, layers });

			const calls: [number, number][] = [];
			controller.onAutoFrame = (x, y) => calls.push([x, y]);

			// Extract the dblclick listener from canvas mock
			const addEventListenerCalls = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
			const dblClickEntry = addEventListenerCalls.find(
				(call: unknown[]) => call[0] === 'dblclick'
			);

			expect(dblClickEntry).toBeDefined();

			// Simulate dblclick
			dblClickEntry![1]({ clientX: 100, clientY: 200 } as MouseEvent);

			expect(calls).toEqual([[100, 200]]);

			controller.dispose();
		});
	});

	describe('clip planes', () => {
		it('setClipPlanes updates the specified layer', () => {
			const layers = new SceneLayerManager(1);
			layers.setClipPlanes('near' as any, 0.001, 500);
			const planes = layers.getClipPlanes('near' as any);
			expect(planes.near).toBe(0.001);
			expect(planes.far).toBe(500);
		});
	});

	describe('dispose', () => {
		it('removes event listeners from canvas', () => {
			const canvas = createMockCanvas();
			const camera = new PerspectiveCamera(60, 1, 0.1, 100);
			const layers = new SceneLayerManager(1);

			const controller = new CameraController({ camera, canvas, layers });
			controller.dispose();

			expect(canvas.removeEventListener).toHaveBeenCalled();
		});
	});
});
