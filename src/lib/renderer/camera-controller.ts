/**
 * Camera controller with orbit and free-fly modes.
 *
 * - **Orbit mode**: rotate around a target point using spherical coordinates.
 *   Mouse drag to rotate, scroll wheel to zoom, right-drag to pan.
 * - **Free-fly mode**: WASD/QE movement with pointer-lock mouse look.
 *   Scroll wheel adjusts movement speed.
 *
 * Both modes use exponential damping for smooth, natural feel.
 * Mode transitions smoothly interpolate position and orientation.
 */

import {
	Vector3,
	Spherical,
	Quaternion,
	Euler,
	MathUtils,
	PerspectiveCamera
} from 'three/webgpu';
import type { SceneLayerManager } from './scene-layers';
import { WarpController, WarpPhase, type WarpTarget, type WarpOptions, type WarpState, type WarpObstacle } from './warp-controller';
import { TouchHandler } from './touch-handler';

// ─── Types ───────────────────────────────────────────────────────────────────

export enum CameraMode {
	ORBIT = 'orbit',
	FREE_FLY = 'free_fly',
	FOLLOW = 'follow'
}

/** Serializable camera state for bookmarks / sharing. */
export interface CameraState {
	mode: CameraMode;
	position: [number, number, number];
	target: [number, number, number];
	fov: number;
	flySpeed: number;
	/** Euler angles for free-fly orientation (pitch, yaw). */
	pitch: number;
	yaw: number;
}

/** Callback that returns the current world position of a followed object. */
export type FollowTargetProvider = () => Vector3;

export interface CameraControllerOptions {
	camera: PerspectiveCamera;
	canvas: HTMLCanvasElement;
	layers: SceneLayerManager;

	/** Starting mode (default: ORBIT) */
	initialMode?: CameraMode;
	/** Orbit target position (default: origin) */
	target?: Vector3;
	/** Damping factor — higher = snappier, 0 = no damping (default: 5) */
	dampingFactor?: number;
	/** Minimum orbit distance (default: 0.01) */
	minDistance?: number;
	/** Maximum orbit distance (default: 1000) */
	maxDistance?: number;
	/** Minimum polar angle in radians (default: 0.01, avoids gimbal lock at pole) */
	minPolarAngle?: number;
	/** Maximum polar angle in radians (default: PI - 0.01) */
	maxPolarAngle?: number;
	/** Free-fly base speed in units/sec (default: 2) */
	flySpeed?: number;
	/** Minimum fly speed (default: 0.01) */
	minFlySpeed?: number;
	/** Maximum fly speed (default: 1000) */
	maxFlySpeed?: number;
	/** Mouse sensitivity for orbit rotation (default: 0.003) */
	orbitSensitivity?: number;
	/** Mouse sensitivity for free-fly look (default: 0.002) */
	lookSensitivity?: number;
	/** Touch gesture sensitivity multiplier (default: 1) */
	touchSensitivity?: number;
	/** Enable scale-adaptive fly speed: multiplies speed by distance from origin (default: true) */
	scaleAdaptiveSpeed?: boolean;
	/** Minimum scale factor for adaptive speed (default: 0.1) */
	minScaleFactor?: number;
	/** Maximum scale factor for adaptive speed (default: 100) */
	maxScaleFactor?: number;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const _v = new Vector3();
const _q = new Quaternion();

const ORBIT_BUTTON = 0; // left mouse
const PAN_BUTTON = 2; // right mouse

/** Duration of mode transition animation in seconds. */
const TRANSITION_DURATION = 0.6;

/** Speed multiplier per scroll tick for fly speed adjustment. */
const FLY_SPEED_SCROLL_FACTOR = 1.15;

// ─── Controller ──────────────────────────────────────────────────────────────

export class CameraController {
	readonly camera: PerspectiveCamera;
	readonly canvas: HTMLCanvasElement;

	private layers: SceneLayerManager;

	// Current mode
	private _mode: CameraMode;

	// Orbit state
	private target = new Vector3();
	private spherical = new Spherical(5, Math.PI / 3, 0);
	private sphericalTarget = new Spherical(5, Math.PI / 3, 0);
	private panOffset = new Vector3();

	// Free-fly state
	private flySpeed: number;
	private minFlySpeed: number;
	private maxFlySpeed: number;
	private yaw = 0;
	private pitch = 0;
	private moveState = { forward: 0, right: 0, up: 0 };

	// Damping
	private dampingFactor: number;

	// Constraints
	private minDistance: number;
	private maxDistance: number;
	private minPolarAngle: number;
	private maxPolarAngle: number;

	// Sensitivity
	private orbitSensitivity: number;
	private lookSensitivity: number;

	// Scale-adaptive speed
	private scaleAdaptiveSpeed: boolean;
	private minScaleFactor: number;
	private maxScaleFactor: number;

	// Follow mode
	private followProvider: FollowTargetProvider | null = null;
	private followOffset = new Vector3(0, 1, 3);
	private followPosition = new Vector3();

	// Mode transition
	private transitioning = false;
	private transitionProgress = 0;
	private transitionFrom = { position: new Vector3(), quaternion: new Quaternion() };
	private transitionTo = { position: new Vector3(), quaternion: new Quaternion() };
	private transitionTargetMode: CameraMode = CameraMode.ORBIT;

	// FOV animation
	private fovTarget: number;
	private fovAnimating = false;

	// Input tracking
	private isDragging = false;
	private dragButton = -1;
	private pointerLocked = false;
	private mouseDownPos: { x: number; y: number } | null = null;

	// Velocity tracking (position delta per frame)
	private prevPosition = new Vector3();
	private _velocity = new Vector3();
	private _speed = 0;

	// Warp travel
	private warpController = new WarpController();
	private lastWarpState: WarpState | null = null;

	// Touch input
	private touchHandler: TouchHandler;

	// Owner document (derived from canvas, avoids global `document`)
	private doc: Document;

	// Bound event handlers (for cleanup)
	private boundOnMouseDown: (e: MouseEvent) => void;
	private boundOnMouseMove: (e: MouseEvent) => void;
	private boundOnMouseUp: (e: MouseEvent) => void;
	private boundOnWheel: (e: WheelEvent) => void;
	private boundOnKeyDown: (e: KeyboardEvent) => void;
	private boundOnKeyUp: (e: KeyboardEvent) => void;
	private boundOnContextMenu: (e: Event) => void;
	private boundOnPointerLockChange: () => void;
	private boundOnDblClick: (e: MouseEvent) => void;

	get mode(): CameraMode {
		return this._mode;
	}

	constructor(options: CameraControllerOptions) {
		this.camera = options.camera;
		this.canvas = options.canvas;
		this.layers = options.layers;
		this.doc = this.canvas.ownerDocument;

		this._mode = options.initialMode ?? CameraMode.ORBIT;
		this.dampingFactor = options.dampingFactor ?? 5;
		this.minDistance = options.minDistance ?? 0.01;
		this.maxDistance = options.maxDistance ?? 1000;
		this.minPolarAngle = options.minPolarAngle ?? 0.01;
		this.maxPolarAngle = options.maxPolarAngle ?? Math.PI - 0.01;
		this.flySpeed = options.flySpeed ?? 2;
		this.minFlySpeed = options.minFlySpeed ?? 0.01;
		this.maxFlySpeed = options.maxFlySpeed ?? 1000;
		this.orbitSensitivity = options.orbitSensitivity ?? 0.003;
		this.lookSensitivity = options.lookSensitivity ?? 0.002;
		this.scaleAdaptiveSpeed = options.scaleAdaptiveSpeed ?? true;
		this.minScaleFactor = options.minScaleFactor ?? 0.1;
		this.maxScaleFactor = options.maxScaleFactor ?? 100;
		this.fovTarget = this.camera.fov;

		if (options.target) {
			this.target.copy(options.target);
		}

		// Initialize spherical from camera position
		this.syncSphericalFromCamera();

		// Bind event handlers
		this.boundOnMouseDown = this.onMouseDown.bind(this);
		this.boundOnMouseMove = this.onMouseMove.bind(this);
		this.boundOnMouseUp = this.onMouseUp.bind(this);
		this.boundOnWheel = this.onWheel.bind(this);
		this.boundOnKeyDown = this.onKeyDown.bind(this);
		this.boundOnKeyUp = this.onKeyUp.bind(this);
		this.boundOnContextMenu = (e: Event) => e.preventDefault();
		this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
		this.boundOnDblClick = this.onDblClick.bind(this);

		this.canvas.addEventListener('mousedown', this.boundOnMouseDown);
		this.canvas.addEventListener('wheel', this.boundOnWheel, { passive: false });
		this.canvas.addEventListener('contextmenu', this.boundOnContextMenu);
		this.canvas.addEventListener('dblclick', this.boundOnDblClick);
		this.doc.addEventListener('mousemove', this.boundOnMouseMove);
		this.doc.addEventListener('mouseup', this.boundOnMouseUp);
		this.doc.addEventListener('keydown', this.boundOnKeyDown);
		this.doc.addEventListener('keyup', this.boundOnKeyUp);
		this.doc.addEventListener('pointerlockchange', this.boundOnPointerLockChange);

		// Touch gesture handler for mobile/tablet
		this.touchHandler = new TouchHandler({
			element: this.canvas,
			sensitivity: options.touchSensitivity ?? 1,
			callbacks: {
				onOrbit: (dx, dy) => {
					if (this.transitioning || this.warpController.isWarping) return;
					if (this._mode === CameraMode.ORBIT) {
						this.sphericalTarget.theta -= dx * this.orbitSensitivity;
						this.sphericalTarget.phi -= dy * this.orbitSensitivity;
						this.sphericalTarget.phi = MathUtils.clamp(
							this.sphericalTarget.phi,
							this.minPolarAngle,
							this.maxPolarAngle
						);
					}
				},
				onZoom: (factor) => {
					if (this.transitioning || this.warpController.isWarping) return;
					if (this._mode === CameraMode.ORBIT) {
						this.sphericalTarget.radius = MathUtils.clamp(
							this.sphericalTarget.radius * factor,
							this.minDistance,
							this.maxDistance
						);
					}
				},
				onPan: (dx, dy) => {
					if (this.transitioning || this.warpController.isWarping) return;
					if (this._mode === CameraMode.ORBIT) {
						const distance = this.spherical.radius;
						const panScale = distance * 0.001;
						_v.set(-dx * panScale, dy * panScale, 0).applyQuaternion(this.camera.quaternion);
						this.panOffset.add(_v);
					}
				},
				onTap: (x, y) => {
					if (this.transitioning || this.warpController.isWarping) return;
					this.onClick?.(x, y);
				},
				onDoubleTap: (x, y) => {
					if (this.transitioning || this.warpController.isWarping) return;
					this.onAutoFrame?.(x, y);
				},
			},
		});
	}

	// ─── Public API ────────────────────────────────────────────────────────

	/** Switch camera mode with smooth transition. */
	setMode(mode: CameraMode): void {
		if (mode === this._mode || this.transitioning) return;

		// Capture current state
		this.transitionFrom.position.copy(this.camera.position);
		this.transitionFrom.quaternion.copy(this.camera.quaternion);

		// Compute destination state
		if (mode === CameraMode.ORBIT) {
			// Transition to orbit: compute where the camera would be in orbit around current target
			this.syncSphericalFromCamera();
			this.sphericalTarget.copy(this.spherical);
			const orbitPos = this.computeOrbitPosition(this.spherical);
			this.transitionTo.position.copy(orbitPos);

			// Look at target
			_v.copy(this.target).sub(orbitPos).normalize();
			_q.setFromUnitVectors(new Vector3(0, 0, -1), _v);
			this.transitionTo.quaternion.copy(_q);

			// Exit pointer lock if active
			if (this.pointerLocked) {
				this.doc.exitPointerLock();
			}
		} else {
			// Transition to free-fly: keep current position, derive euler from current orientation
			this.transitionTo.position.copy(this.camera.position);
			this.transitionTo.quaternion.copy(this.camera.quaternion);
			const euler = new Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
			this.yaw = euler.y;
			this.pitch = euler.x;
		}

		this.transitionTargetMode = mode;
		this.transitioning = true;
		this.transitionProgress = 0;
	}

	/** Set orbit target position. */
	setTarget(target: Vector3): void {
		this.target.copy(target);
		if (this._mode === CameraMode.ORBIT) {
			this.syncSphericalFromCamera();
			this.sphericalTarget.copy(this.spherical);
		}
	}

	/** Get current orbit target (copy). */
	getTarget(): Vector3 {
		return this.target.clone();
	}

	/** Animate FOV to a new value across all scene layers. */
	setFov(fov: number, animate = true): void {
		this.fovTarget = MathUtils.clamp(fov, 10, 150);
		if (!animate) {
			this.camera.fov = this.fovTarget;
			this.layers.setFov(this.fovTarget);
			this.fovAnimating = false;
		} else {
			this.fovAnimating = true;
		}
	}

	/** Get current FOV. */
	getFov(): number {
		return this.camera.fov;
	}

	/** Get the target FOV (may differ from current during animation). */
	getFovTarget(): number {
		return this.fovTarget;
	}

	/** Get current fly speed. */
	getFlySpeed(): number {
		return this.flySpeed;
	}

	/** Set fly speed directly. */
	setFlySpeed(speed: number): void {
		this.flySpeed = MathUtils.clamp(speed, this.minFlySpeed, this.maxFlySpeed);
	}

	/** Set orbit rotation mouse sensitivity (radians per pixel). */
	setOrbitSensitivity(sensitivity: number): void {
		this.orbitSensitivity = Math.max(0.0005, Math.min(0.02, sensitivity));
	}

	/** Set free-fly mouse look sensitivity (radians per pixel). */
	setLookSensitivity(sensitivity: number): void {
		this.lookSensitivity = Math.max(0.0005, Math.min(0.02, sensitivity));
	}

	/** Get current orbit sensitivity. */
	getOrbitSensitivity(): number {
		return this.orbitSensitivity;
	}

	/** Get current look sensitivity. */
	getLookSensitivity(): number {
		return this.lookSensitivity;
	}

	/** Set touch gesture sensitivity multiplier (0.25–4). */
	setTouchSensitivity(sensitivity: number): void {
		const clamped = Math.max(0.25, Math.min(4, sensitivity));
		this.touchHandler.setSensitivity(clamped);
	}

	/** Update orbit distance constraints dynamically (e.g., based on target object radius). */
	setDistanceLimits(min: number, max: number): void {
		this.minDistance = Math.max(0.0001, min);
		this.maxDistance = Math.max(this.minDistance, max);
		// Clamp current target radius to new limits
		this.sphericalTarget.radius = MathUtils.clamp(
			this.sphericalTarget.radius,
			this.minDistance,
			this.maxDistance
		);
	}

	/**
	 * Smoothly transition to orbit around a target position.
	 * @param position World position to orbit around.
	 * @param objectRadius Radius of the object in world units. Used to set min distance
	 *   and compute a comfortable viewing distance (~3× radius). Pass 0 for point targets.
	 */
	autoFrame(position: Vector3, objectRadius = 0): void {
		if (this.transitioning) return;

		const viewingDistance = objectRadius > 0
			? objectRadius * 3
			: this.spherical.radius; // keep current distance for point targets

		// Set new distance constraints based on object size
		if (objectRadius > 0) {
			this.setDistanceLimits(objectRadius * 1.2, objectRadius * 100);
		}

		// Set orbit target
		this.target.copy(position);

		// Compute destination camera position: orbit at viewing distance
		// Use current spherical angles for a natural approach
		this.syncSphericalFromCamera();
		this.sphericalTarget.radius = MathUtils.clamp(viewingDistance, this.minDistance, this.maxDistance);
		this.sphericalTarget.phi = MathUtils.clamp(this.sphericalTarget.phi, this.minPolarAngle, this.maxPolarAngle);

		const destPos = this.computeOrbitPosition(this.sphericalTarget);

		// Set up transition
		this.transitionFrom.position.copy(this.camera.position);
		this.transitionFrom.quaternion.copy(this.camera.quaternion);
		this.transitionTo.position.copy(destPos);

		// Look at target from destination
		_v.copy(position).sub(destPos).normalize();
		_q.setFromUnitVectors(new Vector3(0, 0, -1), _v);
		this.transitionTo.quaternion.copy(_q);

		this.transitionTargetMode = CameraMode.ORBIT;
		this.transitioning = true;
		this.transitionProgress = 0;

		// Exit pointer lock if active
		if (this.pointerLocked) {
			this.doc.exitPointerLock();
		}
	}

	/**
	 * Set a follow target. The camera will track behind the object.
	 * @param provider Callback returning the object's current world position each frame.
	 * @param offset Camera offset relative to the object (default: slightly above and behind).
	 */
	setFollowTarget(provider: FollowTargetProvider, offset?: Vector3): void {
		this.followProvider = provider;
		if (offset) {
			this.followOffset.copy(offset);
		}
		// Initialize follow position
		this.followPosition.copy(provider());
		this.setMode(CameraMode.FOLLOW);
	}

	/** Clear follow target and return to orbit mode. */
	clearFollowTarget(): void {
		this.followProvider = null;
		if (this._mode === CameraMode.FOLLOW) {
			this.setMode(CameraMode.ORBIT);
		}
	}

	/** Serialize camera state to a plain object for bookmarks / sharing. */
	serialize(): CameraState {
		return {
			mode: this._mode,
			position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
			target: [this.target.x, this.target.y, this.target.z],
			fov: this.camera.fov,
			flySpeed: this.flySpeed,
			pitch: this.pitch,
			yaw: this.yaw
		};
	}

	/** Restore camera state from a serialized object. Applies immediately (no transition). */
	deserialize(state: CameraState): void {
		this.camera.position.set(state.position[0], state.position[1], state.position[2]);
		this.target.set(state.target[0], state.target[1], state.target[2]);
		this.camera.fov = state.fov;
		this.fovTarget = state.fov;
		this.layers.setFov(state.fov);
		this.flySpeed = MathUtils.clamp(state.flySpeed, this.minFlySpeed, this.maxFlySpeed);
		this.pitch = state.pitch;
		this.yaw = state.yaw;

		this._mode = state.mode;
		this.transitioning = false;

		if (state.mode === CameraMode.ORBIT) {
			this.syncSphericalFromCamera();
			this.sphericalTarget.copy(this.spherical);
			this.camera.lookAt(this.target);
		} else if (state.mode === CameraMode.FREE_FLY) {
			_q.setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
			this.camera.quaternion.copy(_q);
		}
	}

	/** Register a callback for double-click events on the canvas (for object picking). */
	onAutoFrame: ((x: number, y: number) => void) | null = null;

	/** Register a callback for single-click events on the canvas (for object selection). */
	onClick: ((x: number, y: number) => void) | null = null;

	/** Provider for warp collision avoidance obstacles. Called at warp start to get current body positions. */
	obstacleProvider: (() => WarpObstacle[]) | null = null;

	/**
	 * Begin a warp to the given target.
	 * Takes exclusive camera control until arrival, then transitions to orbit mode.
	 * @param target Destination position, radius, and optional name.
	 * @param options Timing and arc configuration.
	 */
	warpTo(target: WarpTarget, options?: WarpOptions): void {
		if (this.warpController.isWarping) return;

		// Exit pointer lock if active
		if (this.pointerLocked) {
			this.doc.exitPointerLock();
		}

		// Cancel any in-progress transition
		this.transitioning = false;

		this.warpController.onComplete = (position, radius) => {
			// Arrive: switch to orbit mode around destination
			this.target.copy(position);
			const viewDist = radius > 0 ? radius * 3 : this.spherical.radius;
			if (radius > 0) {
				this.setDistanceLimits(radius * 1.2, radius * 100);
			} else {
				// Reset to defaults for point targets (stars, black holes, etc.)
				// so distance limits from a previous body warp don't persist
				this.setDistanceLimits(0.01, 1000);
			}
			this.syncSphericalFromCamera();
			this.sphericalTarget.radius = MathUtils.clamp(viewDist, this.minDistance, this.maxDistance);
			this.sphericalTarget.phi = MathUtils.clamp(this.sphericalTarget.phi, this.minPolarAngle, this.maxPolarAngle);
			this._mode = CameraMode.ORBIT;
		};

		// Gather obstacles for collision avoidance
		const obstacles = this.obstacleProvider?.() ?? [];
		this.warpController.start(this.camera.position, target, {
			...options,
			obstacles: obstacles.length > 0 ? obstacles : undefined
		});
	}

	/** Cancel an in-progress warp. Camera stays at its current position. */
	cancelWarp(): void {
		this.warpController.cancel();
		this.lastWarpState = null;
	}

	/** Whether a warp is currently in progress. */
	get isWarping(): boolean {
		return this.warpController.isWarping;
	}

	/** Set default warp duration in seconds (1–15). */
	setWarpDuration(seconds: number): void {
		this.warpController.setDuration(seconds);
	}

	/** Get current warp duration. */
	getWarpDuration(): number {
		return this.warpController.getDuration();
	}

	/**
	 * Get the current warp state for effects (star streak, FOV, etc.).
	 * Returns null when not warping.
	 */
	getWarpState(): WarpState | null {
		return this.lastWarpState;
	}

	/** Current camera velocity vector in AU/s. */
	getVelocity(): Vector3 {
		return this._velocity.clone();
	}

	/** Current camera speed in AU/s. */
	getSpeed(): number {
		return this._speed;
	}

	/**
	 * Update camera state. Call once per frame.
	 * @param delta Time since last frame in seconds.
	 */
	update(delta: number): void {
		// Track velocity from position delta
		if (delta > 0) {
			this._velocity.subVectors(this.camera.position, this.prevPosition).divideScalar(delta);
			this._speed = this._velocity.length();
		}
		this.prevPosition.copy(this.camera.position);
		// Warp takes exclusive control when active
		if (this.warpController.isWarping) {
			this.lastWarpState = this.warpController.update(delta);
			if (this.lastWarpState) {
				// Apply warp position and orientation to camera
				this.warpController.getPosition(this.camera.position);
				this.warpController.getQuaternion(this.camera.quaternion);
			}
			// Note: FOV is driven by WarpEffects, not updateFov
			return;
		}

		// Clear warp state after warp completes
		if (this.lastWarpState) {
			this.lastWarpState = null;
		}

		if (this.transitioning) {
			this.updateTransition(delta);
			return;
		}

		if (this._mode === CameraMode.ORBIT) {
			this.updateOrbit(delta);
		} else if (this._mode === CameraMode.FOLLOW) {
			this.updateFollow(delta);
		} else {
			this.updateFreeFly(delta);
		}

		this.updateFov(delta);
	}

	/** Remove all event listeners and clean up. */
	dispose(): void {
		this.canvas.removeEventListener('mousedown', this.boundOnMouseDown);
		this.canvas.removeEventListener('wheel', this.boundOnWheel);
		this.canvas.removeEventListener('contextmenu', this.boundOnContextMenu);
		this.canvas.removeEventListener('dblclick', this.boundOnDblClick);
		this.doc.removeEventListener('mousemove', this.boundOnMouseMove);
		this.doc.removeEventListener('mouseup', this.boundOnMouseUp);
		this.doc.removeEventListener('keydown', this.boundOnKeyDown);
		this.doc.removeEventListener('keyup', this.boundOnKeyUp);
		this.doc.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
		this.touchHandler.dispose();

		if (this.pointerLocked) {
			this.doc.exitPointerLock();
		}
	}

	// ─── Orbit mode ────────────────────────────────────────────────────────

	private updateOrbit(delta: number): void {
		const lerpFactor = 1 - Math.exp(-this.dampingFactor * delta);

		// Apply pan offset to target
		if (this.panOffset.lengthSq() > 1e-10) {
			this.target.add(this.panOffset);
			this.panOffset.set(0, 0, 0);
		}

		// Damp spherical toward target
		this.spherical.theta = MathUtils.lerp(
			this.spherical.theta,
			this.sphericalTarget.theta,
			lerpFactor
		);
		this.spherical.phi = MathUtils.lerp(
			this.spherical.phi,
			this.sphericalTarget.phi,
			lerpFactor
		);
		this.spherical.radius = MathUtils.lerp(
			this.spherical.radius,
			this.sphericalTarget.radius,
			lerpFactor
		);

		// Enforce constraints
		this.spherical.phi = MathUtils.clamp(
			this.spherical.phi,
			this.minPolarAngle,
			this.maxPolarAngle
		);
		this.spherical.radius = MathUtils.clamp(
			this.spherical.radius,
			this.minDistance,
			this.maxDistance
		);

		// Position camera on sphere around target
		const pos = this.computeOrbitPosition(this.spherical);
		this.camera.position.copy(pos);
		this.camera.lookAt(this.target);
	}

	private computeOrbitPosition(spherical: Spherical): Vector3 {
		const offset = new Vector3().setFromSpherical(spherical);
		return offset.add(this.target);
	}

	// ─── Free-fly mode ─────────────────────────────────────────────────────

	private updateFreeFly(delta: number): void {
		// Build direction from move state
		const { forward, right, up } = this.moveState;
		if (forward !== 0 || right !== 0 || up !== 0) {
			// Scale-adaptive speed: multiply by distance from origin so movement
			// feels proportional regardless of where you are in the scene
			let effectiveSpeed = this.flySpeed;
			if (this.scaleAdaptiveSpeed) {
				const distFromOrigin = this.camera.position.length();
				const scaleFactor = MathUtils.clamp(
					distFromOrigin,
					this.minScaleFactor,
					this.maxScaleFactor
				);
				effectiveSpeed *= scaleFactor;
			}

			_v.set(right, up, -forward).normalize().multiplyScalar(effectiveSpeed * delta);

			// Rotate movement direction by camera orientation
			_v.applyQuaternion(this.camera.quaternion);
			this.camera.position.add(_v);
		}

		// Apply euler angles to camera
		_q.setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
		this.camera.quaternion.copy(_q);
	}

	// ─── Follow mode ──────────────────────────────────────────────────────

	private updateFollow(delta: number): void {
		if (!this.followProvider) {
			// Provider was cleared — fall back to orbit
			this._mode = CameraMode.ORBIT;
			this.syncSphericalFromCamera();
			this.sphericalTarget.copy(this.spherical);
			return;
		}

		const targetPos = this.followProvider();
		const lerpFactor = 1 - Math.exp(-this.dampingFactor * delta);

		// Smooth the tracked position to handle velocity changes gracefully
		this.followPosition.lerp(targetPos, lerpFactor);

		// Desired camera position = target + offset
		const desiredPos = _v.copy(this.followPosition).add(this.followOffset);

		// Damp camera toward desired position
		this.camera.position.lerp(desiredPos, lerpFactor);

		// Look at the followed object
		this.camera.lookAt(this.followPosition);

		// Keep orbit target in sync so switching to orbit mode is seamless
		this.target.copy(this.followPosition);
	}

	// ─── Mode transition ───────────────────────────────────────────────────

	private updateTransition(delta: number): void {
		this.transitionProgress += delta / TRANSITION_DURATION;

		if (this.transitionProgress >= 1) {
			// Transition complete
			this.transitionProgress = 1;
			this.transitioning = false;
			this._mode = this.transitionTargetMode;
		}

		// Smooth step easing
		const t = smoothStep(this.transitionProgress);

		this.camera.position.lerpVectors(
			this.transitionFrom.position,
			this.transitionTo.position,
			t
		);
		this.camera.quaternion.slerpQuaternions(
			this.transitionFrom.quaternion,
			this.transitionTo.quaternion,
			t
		);
	}

	// ─── FOV animation ─────────────────────────────────────────────────────

	private updateFov(delta: number): void {
		if (!this.fovAnimating) return;

		const diff = this.fovTarget - this.camera.fov;
		if (Math.abs(diff) < 0.05) {
			this.camera.fov = this.fovTarget;
			this.fovAnimating = false;
		} else {
			const lerpFactor = 1 - Math.exp(-8 * delta);
			this.camera.fov = MathUtils.lerp(this.camera.fov, this.fovTarget, lerpFactor);
		}
		this.layers.setFov(this.camera.fov);
	}

	// ─── Input helpers ─────────────────────────────────────────────────────

	private syncSphericalFromCamera(): void {
		_v.copy(this.camera.position).sub(this.target);
		this.spherical.setFromVector3(_v);
		this.sphericalTarget.copy(this.spherical);
	}

	// ─── Mouse events ──────────────────────────────────────────────────────

	private onMouseDown(e: MouseEvent): void {
		if (this.transitioning || this.warpController.isWarping) return;

		this.mouseDownPos = { x: e.clientX, y: e.clientY };

		if (this._mode === CameraMode.ORBIT) {
			if (e.button === ORBIT_BUTTON || e.button === PAN_BUTTON) {
				this.isDragging = true;
				this.dragButton = e.button;
			}
		} else if (this._mode === CameraMode.FREE_FLY) {
			// Request pointer lock for free-fly mouse look
			if (!this.pointerLocked) {
				this.canvas.requestPointerLock();
			}
		}
	}

	private onMouseMove(e: MouseEvent): void {
		if (this.transitioning || this.warpController.isWarping) return;

		if (this._mode === CameraMode.ORBIT && this.isDragging) {
			const dx = e.movementX;
			const dy = e.movementY;

			if (this.dragButton === ORBIT_BUTTON) {
				// Rotate
				this.sphericalTarget.theta -= dx * this.orbitSensitivity;
				this.sphericalTarget.phi -= dy * this.orbitSensitivity;
				this.sphericalTarget.phi = MathUtils.clamp(
					this.sphericalTarget.phi,
					this.minPolarAngle,
					this.maxPolarAngle
				);
			} else if (this.dragButton === PAN_BUTTON) {
				// Pan: move target in camera-local XY plane
				const distance = this.spherical.radius;
				const panScale = distance * 0.001;
				_v.set(-dx * panScale, dy * panScale, 0).applyQuaternion(this.camera.quaternion);
				this.panOffset.add(_v);
			}
		} else if (this._mode === CameraMode.FREE_FLY && this.pointerLocked) {
			this.yaw -= e.movementX * this.lookSensitivity;
			this.pitch -= e.movementY * this.lookSensitivity;
			// Clamp pitch to avoid flipping
			this.pitch = MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
		}
	}

	private onMouseUp(e: MouseEvent): void {
		// Detect single click: mouseup within 3px of mousedown position
		if (this.mouseDownPos && e.button === ORBIT_BUTTON) {
			const dx = e.clientX - this.mouseDownPos.x;
			const dy = e.clientY - this.mouseDownPos.y;
			if (dx * dx + dy * dy < 9) {
				this.onClick?.(e.clientX, e.clientY);
			}
		}
		this.mouseDownPos = null;
		this.isDragging = false;
		this.dragButton = -1;
	}

	private onDblClick(e: MouseEvent): void {
		if (this.transitioning || this.warpController.isWarping) return;
		// Delegate to external handler (object picking / raycast)
		this.onAutoFrame?.(e.clientX, e.clientY);
	}

	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		if (this.transitioning || this.warpController.isWarping) return;

		if (this._mode === CameraMode.ORBIT) {
			// Zoom: adjust radius
			const zoomDelta = e.deltaY > 0 ? 1.1 : 1 / 1.1;
			this.sphericalTarget.radius = MathUtils.clamp(
				this.sphericalTarget.radius * zoomDelta,
				this.minDistance,
				this.maxDistance
			);
		} else {
			// Free-fly: adjust movement speed
			const speedDelta =
				e.deltaY > 0 ? 1 / FLY_SPEED_SCROLL_FACTOR : FLY_SPEED_SCROLL_FACTOR;
			this.flySpeed = MathUtils.clamp(
				this.flySpeed * speedDelta,
				this.minFlySpeed,
				this.maxFlySpeed
			);
		}
	}

	// ─── Keyboard events ───────────────────────────────────────────────────

	private onKeyDown(e: KeyboardEvent): void {
		// Don't capture if user is typing in an input field
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		this.updateMoveState(e.code, true);
	}

	private onKeyUp(e: KeyboardEvent): void {
		this.updateMoveState(e.code, false);
	}

	private updateMoveState(code: string, pressed: boolean): void {
		const value = pressed ? 1 : 0;
		switch (code) {
			case 'KeyW':
			case 'ArrowUp':
				this.moveState.forward = value;
				break;
			case 'KeyS':
			case 'ArrowDown':
				this.moveState.forward = -value;
				break;
			case 'KeyA':
			case 'ArrowLeft':
				this.moveState.right = -value;
				break;
			case 'KeyD':
			case 'ArrowRight':
				this.moveState.right = value;
				break;
			case 'KeyQ':
				this.moveState.up = -value;
				break;
			case 'KeyE':
				this.moveState.up = value;
				break;
		}
	}

	private onPointerLockChange(): void {
		this.pointerLocked = this.doc.pointerLockElement === this.canvas;
		if (!this.pointerLocked && this._mode === CameraMode.FREE_FLY) {
			// Reset move state when pointer lock is lost
			this.moveState.forward = 0;
			this.moveState.right = 0;
			this.moveState.up = 0;
		}
	}
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Hermite smooth step: 0→1 with zero derivatives at endpoints. */
function smoothStep(t: number): number {
	return t * t * (3 - 2 * t);
}
