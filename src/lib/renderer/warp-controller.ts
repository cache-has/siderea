/**
 * Warp Travel controller — fast teleport between any two points in the scene.
 *
 * Drives the camera along a cubic Bezier spline from origin to destination
 * with an S-curve speed profile: exponential acceleration → cruise →
 * exponential deceleration. Total travel time is constant (configurable,
 * default 5s) regardless of distance.
 *
 * Warp is NOT a camera mode — it's a temporary animation that takes exclusive
 * control of the camera, then hands off to orbit mode on arrival.
 *
 * The Bezier arc lifts above the line between start and end, producing an
 * aesthetically pleasing flight path that naturally avoids most solar system
 * objects in the ecliptic plane.
 *
 * Scale transitions (AU ↔ parsec boundary) are handled by detecting when
 * the camera has moved far enough from the origin to warrant switching
 * reference frames.
 */

import { Vector3, MathUtils, Quaternion } from 'three/webgpu';

// ─── Types ───────────────────────────────────────────────────────────────────

export enum WarpPhase {
	IDLE = 'idle',
	ACCELERATING = 'accelerating',
	CRUISING = 'cruising',
	DECELERATING = 'decelerating'
}

export interface WarpTarget {
	/** Destination position in near-scene coordinates (AU). */
	position: Vector3;
	/** Radius of destination object in AU (for orbit framing on arrival). 0 for point targets. */
	radius: number;
	/** Optional human-readable name for HUD display. */
	name?: string;
}

/** A body position for collision avoidance during warp path planning. */
export interface WarpObstacle {
	/** Position in AU (near-scene coordinates). */
	position: Vector3;
	/** Avoidance radius in AU — path will not come closer than this. */
	radius: number;
}

export interface WarpOptions {
	/** Total warp duration in seconds. @default 5 */
	duration?: number;
	/** Fraction of duration spent accelerating. @default 0.25 */
	accelFraction?: number;
	/** Fraction of duration spent decelerating. @default 0.25 */
	decelFraction?: number;
	/** Arc height as fraction of travel distance (0 = straight line). @default 0.15 */
	arcHeight?: number;
	/** Bodies to avoid during warp. Path control points are nudged away from these. */
	obstacles?: WarpObstacle[];
}

export interface WarpState {
	phase: WarpPhase;
	/** 0→1 overall progress through the warp. */
	progress: number;
	/** Current speed as fraction of peak speed (0→1→0 profile). */
	speedFraction: number;
	/** Normalized velocity direction (for star streak effect). */
	velocity: Vector3;
	/** Name of destination, if provided. */
	targetName: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULTS: Required<Omit<WarpOptions, 'obstacles'>> = {
	duration: 5,
	accelFraction: 0.25,
	decelFraction: 0.25,
	arcHeight: 0.15
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Hermite smooth step: zero-derivative at endpoints. */
function smoothStep(t: number): number {
	return t * t * (3 - 2 * t);
}

/** Quintic smooth step: zero first AND second derivative at endpoints. */
function smootherStep(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Evaluate a cubic Bezier curve at parameter t.
 * B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
 */
function cubicBezier(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, out: Vector3): Vector3 {
	const u = 1 - t;
	const u2 = u * u;
	const u3 = u2 * u;
	const t2 = t * t;
	const t3 = t2 * t;

	out.set(0, 0, 0);
	out.addScaledVector(p0, u3);
	out.addScaledVector(p1, 3 * u2 * t);
	out.addScaledVector(p2, 3 * u * t2);
	out.addScaledVector(p3, t3);
	return out;
}

/**
 * Evaluate the derivative of a cubic Bezier at parameter t (tangent vector).
 * B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
 */
function cubicBezierDerivative(
	p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3,
	t: number, out: Vector3
): Vector3 {
	const u = 1 - t;
	const u2 = u * u;
	const t2 = t * t;

	// Pre-compute segment vectors
	const a = _tmpA.copy(p1).sub(p0);
	const b = _tmpB.copy(p2).sub(p1);
	const c = _tmpC.copy(p3).sub(p2);

	out.set(0, 0, 0);
	out.addScaledVector(a, 3 * u2);
	out.addScaledVector(b, 6 * u * t);
	out.addScaledVector(c, 3 * t2);
	return out;
}

/** Number of sample points along the Bezier to check for obstacle proximity. */
const COLLISION_SAMPLES = 20;
/** Maximum number of nudge iterations to avoid obstacles. */
const MAX_AVOIDANCE_ITERATIONS = 3;

// Reusable temp vectors to avoid allocation
const _tmpA = new Vector3();
const _tmpB = new Vector3();
const _tmpC = new Vector3();
const _tmpPos = new Vector3();
const _tmpTan = new Vector3();
const _tmpLookAt = new Vector3();
const _tmpUp = new Vector3(0, 1, 0);
const _tmpQ = new Quaternion();
const _tmpSample = new Vector3();
const _tmpNudge = new Vector3();

// ─── Controller ──────────────────────────────────────────────────────────────

export class WarpController {
	private phase: WarpPhase = WarpPhase.IDLE;
	private elapsed = 0;
	private duration = DEFAULTS.duration;
	private accelFraction = DEFAULTS.accelFraction;
	private decelFraction = DEFAULTS.decelFraction;

	// Bezier control points (in near-scene AU coordinates)
	private p0 = new Vector3();
	private p1 = new Vector3();
	private p2 = new Vector3();
	private p3 = new Vector3();

	// Destination info
	private targetRadius = 0;
	private targetName: string | null = null;

	// Current interpolated state
	private currentPosition = new Vector3();
	private currentVelocity = new Vector3();
	private currentSpeedFraction = 0;
	private currentProgress = 0;

	/** Callback fired when warp completes. Receives destination position and radius. */
	onComplete: ((position: Vector3, radius: number) => void) | null = null;

	get isWarping(): boolean {
		return this.phase !== WarpPhase.IDLE;
	}

	/** Set the default warp duration in seconds (used for next warp). */
	setDuration(seconds: number): void {
		this.duration = Math.max(1, Math.min(15, seconds));
	}

	/** Get current warp duration. */
	getDuration(): number {
		return this.duration;
	}

	/**
	 * Begin a warp to the given target.
	 * @param startPosition Current camera position in AU.
	 * @param target Destination info.
	 * @param options Timing/arc configuration.
	 */
	start(startPosition: Vector3, target: WarpTarget, options?: WarpOptions): void {
		const opts = { ...DEFAULTS, ...options };
		this.duration = opts.duration;
		this.accelFraction = opts.accelFraction;
		this.decelFraction = opts.decelFraction;
		this.targetRadius = target.radius;
		this.targetName = target.name ?? null;
		this.elapsed = 0;

		// P0 = start, P3 = destination
		this.p0.copy(startPosition);
		this.p3.copy(target.position);

		// Compute Bezier control points for an aesthetically pleasing arc.
		// The arc lifts "up" (Y+) relative to the travel vector, which naturally
		// avoids objects in the ecliptic plane.
		this.computeControlPoints(opts.arcHeight);

		// Nudge control points away from obstacles if any path sample is too close
		if (opts.obstacles && opts.obstacles.length > 0) {
			this.avoidObstacles(opts.obstacles);
		}

		this.phase = WarpPhase.ACCELERATING;
	}

	/** Cancel an in-progress warp. Camera stays where it is. */
	cancel(): void {
		this.phase = WarpPhase.IDLE;
		this.elapsed = 0;
	}

	/**
	 * Advance the warp animation by delta seconds.
	 * @returns Current warp state (position, velocity, progress, etc.)
	 *          or null if not warping.
	 */
	update(delta: number): WarpState | null {
		if (this.phase === WarpPhase.IDLE) return null;

		this.elapsed += delta;
		const t = Math.min(this.elapsed / this.duration, 1);
		this.currentProgress = t;

		// Map linear time to path parameter via speed profile
		const pathT = this.speedProfile(t);

		// Evaluate position and tangent on the Bezier curve
		cubicBezier(this.p0, this.p1, this.p2, this.p3, pathT, this.currentPosition);
		cubicBezierDerivative(this.p0, this.p1, this.p2, this.p3, pathT, this.currentVelocity);

		// Compute speed fraction for effects (0 at start/end, 1 at peak)
		this.currentSpeedFraction = this.computeSpeedFraction(t);

		// Update phase
		const accelEnd = this.accelFraction;
		const cruiseEnd = 1 - this.decelFraction;

		if (t < accelEnd) {
			this.phase = WarpPhase.ACCELERATING;
		} else if (t < cruiseEnd) {
			this.phase = WarpPhase.CRUISING;
		} else {
			this.phase = WarpPhase.DECELERATING;
		}

		// Normalize velocity for direction
		const velNorm = _tmpTan.copy(this.currentVelocity);
		if (velNorm.lengthSq() > 1e-10) {
			velNorm.normalize();
		}

		// Check completion
		if (t >= 1) {
			const destPos = this.p3.clone();
			const destRadius = this.targetRadius;
			this.phase = WarpPhase.IDLE;
			this.elapsed = 0;
			this.onComplete?.(destPos, destRadius);

			return {
				phase: WarpPhase.IDLE,
				progress: 1,
				speedFraction: 0,
				velocity: velNorm.clone(),
				targetName: this.targetName
			};
		}

		return {
			phase: this.phase,
			progress: this.currentProgress,
			speedFraction: this.currentSpeedFraction,
			velocity: velNorm.clone(),
			targetName: this.targetName
		};
	}

	/** Get the current interpolated camera position (call after update). */
	getPosition(out?: Vector3): Vector3 {
		const target = out ?? new Vector3();
		return target.copy(this.currentPosition);
	}

	/** Get the current look-at quaternion (camera faces along travel direction). */
	getQuaternion(out?: Quaternion): Quaternion {
		const target = out ?? new Quaternion();

		if (this.currentVelocity.lengthSq() < 1e-10) {
			return target.identity();
		}

		// Look along velocity direction
		_tmpLookAt.copy(this.currentPosition).add(this.currentVelocity);
		// Build a lookAt-style quaternion
		// We construct a rotation matrix from forward (velocity), up (world Y), and derive right
		const forward = _tmpTan.copy(this.currentVelocity).normalize();
		const right = _tmpA.crossVectors(_tmpUp, forward).normalize();
		// Handle degenerate case where forward ≈ up
		if (right.lengthSq() < 1e-4) {
			right.set(1, 0, 0);
		}
		const up = _tmpB.crossVectors(forward, right);

		// Build rotation matrix elements and extract quaternion
		// Matrix columns: right, up, -forward (Three.js camera looks down -Z)
		target.setFromRotationMatrix({
			elements: [
				right.x, up.x, -forward.x, 0,
				right.y, up.y, -forward.y, 0,
				right.z, up.z, -forward.z, 0,
				0, 0, 0, 1
			]
		} as any);

		return target;
	}

	/** Get the destination position. */
	getDestination(out?: Vector3): Vector3 {
		const target = out ?? new Vector3();
		return target.copy(this.p3);
	}

	// ─── Internals ────────────────────────────────────────────────────────

	/**
	 * Compute Bezier control points that create an arc above the travel line.
	 *
	 * P1 and P2 are placed 1/3 and 2/3 along the line between P0 and P3,
	 * then displaced upward by arcHeight × distance.
	 */
	private computeControlPoints(arcHeight: number): void {
		const distance = this.p0.distanceTo(this.p3);
		const lift = distance * arcHeight;

		// Direction from start to end
		const dir = _tmpA.copy(this.p3).sub(this.p0);

		// Compute an "up" vector perpendicular to the travel direction.
		// Prefer world Y; if travel is nearly vertical, use world Z instead.
		const up = _tmpB.set(0, 1, 0);
		if (Math.abs(dir.normalize().dot(up)) > 0.95) {
			up.set(0, 0, 1);
		}

		// Perpendicular lift direction
		const perp = _tmpC.crossVectors(dir, up).normalize();
		const liftDir = up.crossVectors(perp, dir).normalize();

		// P1: 1/3 along + lift
		this.p1.lerpVectors(this.p0, this.p3, 1 / 3);
		this.p1.addScaledVector(liftDir, lift);

		// P2: 2/3 along + lift (slightly less, for a nice approach arc)
		this.p2.lerpVectors(this.p0, this.p3, 2 / 3);
		this.p2.addScaledVector(liftDir, lift * 0.6);
	}

	/**
	 * Nudge P1 and P2 away from obstacles that the path passes too close to.
	 *
	 * Samples the Bezier at COLLISION_SAMPLES evenly-spaced points. For each
	 * sample inside an obstacle, computes a perpendicular displacement away
	 * from the obstacle (perpendicular to the travel line to ensure the path
	 * is deflected sideways, not just stretched). Nudges are accumulated on
	 * the nearest control point (P1 for t < 0.5, P2 for t >= 0.5).
	 *
	 * Iterates up to MAX_AVOIDANCE_ITERATIONS times — each nudge may bring
	 * another part of the curve closer to a different obstacle.
	 */
	private avoidObstacles(obstacles: WarpObstacle[]): void {
		// Travel direction for perpendicular projection
		const travelDir = _tmpA.copy(this.p3).sub(this.p0);
		const travelLen = travelDir.length();
		if (travelLen < 1e-10) return;
		travelDir.divideScalar(travelLen);

		// Default perpendicular direction (used when displacement is along travel line)
		const defaultPerp = _tmpB.set(0, 1, 0);
		if (Math.abs(travelDir.dot(defaultPerp)) > 0.95) defaultPerp.set(0, 0, 1);
		const defaultPerpDir = _tmpC.crossVectors(travelDir, defaultPerp).normalize();

		for (let iter = 0; iter < MAX_AVOIDANCE_ITERATIONS; iter++) {
			let worstPenetration = 0;
			const nudgeP1 = new Vector3();
			const nudgeP2 = new Vector3();

			for (let i = 1; i < COLLISION_SAMPLES - 1; i++) {
				const t = i / (COLLISION_SAMPLES - 1);
				cubicBezier(this.p0, this.p1, this.p2, this.p3, t, _tmpSample);

				for (const obs of obstacles) {
					const dist = _tmpSample.distanceTo(obs.position);
					if (dist >= obs.radius) continue;

					const penetration = obs.radius - dist;
					worstPenetration = Math.max(worstPenetration, penetration);

					// Compute displacement from obstacle to sample, then remove the
					// component along the travel line so the nudge is purely perpendicular
					if (dist > 1e-10) {
						_tmpNudge.copy(_tmpSample).sub(obs.position);
						// Remove travel-parallel component
						const parallel = _tmpNudge.dot(travelDir);
						_tmpNudge.addScaledVector(travelDir, -parallel);
					}

					// If perpendicular component is negligible (path goes directly through
					// obstacle center along travel line), use the default perpendicular
					if (_tmpNudge.lengthSq() < 1e-8 || dist <= 1e-10) {
						_tmpNudge.copy(defaultPerpDir);
					} else {
						_tmpNudge.normalize();
					}

					_tmpNudge.multiplyScalar(penetration * 1.5);

					if (t < 0.5) {
						nudgeP1.add(_tmpNudge);
					} else {
						nudgeP2.add(_tmpNudge);
					}
				}
			}

			if (worstPenetration < 1e-6) break;

			this.p1.add(nudgeP1);
			this.p2.add(nudgeP2);
		}
	}

	/**
	 * Speed profile: maps linear time t ∈ [0,1] to path parameter ∈ [0,1].
	 *
	 * Uses smootherStep (quintic) easing which has zero first AND second
	 * derivatives at endpoints — produces the feel of exponential
	 * acceleration and deceleration without actual exponentials.
	 *
	 * The three-phase structure (accel / cruise / decel) is handled by
	 * piecewise mapping:
	 * - [0, accelFraction]: ease-in from 0
	 * - [accelFraction, 1-decelFraction]: linear cruise
	 * - [1-decelFraction, 1]: ease-out to 1
	 */
	private speedProfile(t: number): number {
		const accelEnd = this.accelFraction;
		const cruiseEnd = 1 - this.decelFraction;
		const cruiseLength = cruiseEnd - accelEnd;

		if (t <= 0) return 0;
		if (t >= 1) return 1;

		// Compute how much path distance each phase covers.
		// Accel and decel phases each cover less distance than cruise
		// because the camera is slower during those phases.
		// With smootherStep easing, the average speed during accel/decel is ~0.5×.
		const accelDistance = accelEnd * 0.5;
		const cruiseDistance = cruiseLength;
		const decelDistance = this.decelFraction * 0.5;
		const totalDistance = accelDistance + cruiseDistance + decelDistance;

		// Normalize so total = 1
		const accelNorm = accelDistance / totalDistance;
		const cruiseNorm = cruiseDistance / totalDistance;

		if (t < accelEnd) {
			// Acceleration phase: smootherStep ease-in
			const localT = t / accelEnd;
			return smootherStep(localT) * accelNorm;
		} else if (t < cruiseEnd) {
			// Cruise phase: linear
			const localT = (t - accelEnd) / cruiseLength;
			return accelNorm + localT * cruiseNorm;
		} else {
			// Deceleration phase: smootherStep ease-out (reversed)
			const localT = (t - cruiseEnd) / this.decelFraction;
			return accelNorm + cruiseNorm + smootherStep(localT) * (1 - accelNorm - cruiseNorm);
		}
	}

	/**
	 * Compute a 0→1→0 speed fraction for visual effects.
	 * Ramps up during acceleration, holds at 1 during cruise,
	 * ramps down during deceleration.
	 */
	private computeSpeedFraction(t: number): number {
		const accelEnd = this.accelFraction;
		const cruiseEnd = 1 - this.decelFraction;

		if (t < accelEnd) {
			return smoothStep(t / accelEnd);
		} else if (t < cruiseEnd) {
			return 1;
		} else {
			return 1 - smoothStep((t - cruiseEnd) / this.decelFraction);
		}
	}
}
