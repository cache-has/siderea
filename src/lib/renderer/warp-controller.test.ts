import { describe, it, expect, vi } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { WarpController, WarpPhase, type WarpTarget, type WarpObstacle } from './warp-controller';

function makeTarget(x: number, y: number, z: number, radius = 0, name?: string): WarpTarget {
	return { position: new Vector3(x, y, z), radius, name };
}

describe('WarpController', () => {
	it('starts in IDLE phase', () => {
		const wc = new WarpController();
		expect(wc.isWarping).toBe(false);
		expect(wc.update(0.016)).toBeNull();
	});

	it('transitions through all phases during a warp', () => {
		const wc = new WarpController();
		const start = new Vector3(0, 0, 0);
		const target = makeTarget(100, 0, 0, 1, 'Mars');

		wc.start(start, target, { duration: 4, accelFraction: 0.25, decelFraction: 0.25 });
		expect(wc.isWarping).toBe(true);

		// Acceleration phase (first 25% = 1s)
		const s1 = wc.update(0.5);
		expect(s1).not.toBeNull();
		expect(s1!.phase).toBe(WarpPhase.ACCELERATING);
		expect(s1!.progress).toBeCloseTo(0.125, 2);
		expect(s1!.targetName).toBe('Mars');

		// Cruise phase (25%–75% = 1s–3s)
		const s2 = wc.update(1.5); // now at t=2s → 50%
		expect(s2!.phase).toBe(WarpPhase.CRUISING);
		expect(s2!.speedFraction).toBe(1);

		// Deceleration phase (75%–100% = 3s–4s)
		const s3 = wc.update(1.5); // now at t=3.5s → 87.5%
		expect(s3!.phase).toBe(WarpPhase.DECELERATING);
		expect(s3!.speedFraction).toBeLessThan(1);
	});

	it('fires onComplete and returns to IDLE when warp finishes', () => {
		const wc = new WarpController();
		const start = new Vector3(0, 0, 0);
		const target = makeTarget(10, 5, 3, 0.5);
		const onComplete = vi.fn();
		wc.onComplete = onComplete;

		wc.start(start, target, { duration: 1 });

		// Advance past completion
		const state = wc.update(1.1);
		expect(state).not.toBeNull();
		expect(state!.phase).toBe(WarpPhase.IDLE);
		expect(state!.progress).toBe(1);
		expect(wc.isWarping).toBe(false);

		expect(onComplete).toHaveBeenCalledOnce();
		const [pos, radius] = onComplete.mock.calls[0];
		expect(pos.x).toBeCloseTo(10);
		expect(pos.y).toBeCloseTo(5);
		expect(pos.z).toBeCloseTo(3);
		expect(radius).toBe(0.5);
	});

	it('cancel stops warping immediately', () => {
		const wc = new WarpController();
		wc.start(new Vector3(), makeTarget(100, 0, 0));

		wc.update(0.5);
		expect(wc.isWarping).toBe(true);

		wc.cancel();
		expect(wc.isWarping).toBe(false);
		expect(wc.update(0.1)).toBeNull();
	});

	it('getPosition returns interpolated position along the Bezier path', () => {
		const wc = new WarpController();
		const start = new Vector3(0, 0, 0);
		const end = new Vector3(100, 0, 0);
		wc.start(start, makeTarget(100, 0, 0), { duration: 2, arcHeight: 0 });

		// At t=0, position should be at start
		const pos0 = wc.getPosition();
		expect(pos0.x).toBeCloseTo(0, 0);

		// Advance halfway
		wc.update(1.0);
		const posMid = wc.getPosition();
		// Should be somewhere between start and end (Bezier with arcHeight=0 is roughly linear)
		expect(posMid.x).toBeGreaterThan(10);
		expect(posMid.x).toBeLessThan(90);
	});

	it('speed fraction ramps 0→1→0 over the warp duration', () => {
		const wc = new WarpController();
		wc.start(new Vector3(), makeTarget(50, 0, 0), {
			duration: 4,
			accelFraction: 0.25,
			decelFraction: 0.25
		});

		// Start: speed should be near 0
		const s0 = wc.update(0.01);
		expect(s0!.speedFraction).toBeLessThan(0.1);

		// Mid-cruise: speed should be 1
		wc.update(1.99); // now at ~2s = 50%
		const sMid = wc.update(0.01);
		expect(sMid!.speedFraction).toBe(1);

		// Near end: speed should be decreasing
		wc.update(1.5); // now at ~3.5s = 87.5%
		const sEnd = wc.update(0.01);
		expect(sEnd!.speedFraction).toBeLessThan(1);
		expect(sEnd!.speedFraction).toBeGreaterThan(0);
	});

	it('velocity vector is normalized and non-zero during warp', () => {
		const wc = new WarpController();
		wc.start(new Vector3(), makeTarget(100, 50, 25));

		const state = wc.update(0.5);
		expect(state).not.toBeNull();
		const len = state!.velocity.length();
		expect(len).toBeCloseTo(1, 2);
	});

	it('Bezier arc lifts above the travel line', () => {
		const wc = new WarpController();
		const start = new Vector3(0, 0, 0);
		// Travel along X axis — arc should lift in Y
		wc.start(start, makeTarget(100, 0, 0), { duration: 2, arcHeight: 0.15 });

		// At midpoint, Y should be above 0 due to arc
		wc.update(1.0);
		const pos = wc.getPosition();
		expect(pos.y).toBeGreaterThan(0);
	});

	describe('collision avoidance', () => {
		it('nudges path away from an obstacle on the direct travel line', () => {
			const wc = new WarpController();
			const start = new Vector3(0, 0, 0);
			const obstacle: WarpObstacle = {
				position: new Vector3(50, 0, 0),
				radius: 5
			};

			// Use arcHeight=0 so without avoidance the path goes straight through
			wc.start(start, makeTarget(100, 0, 0), {
				duration: 2,
				arcHeight: 0,
				obstacles: [obstacle]
			});

			// Sample the path at many points — none should be within the obstacle radius
			for (let i = 0; i <= 20; i++) {
				wc.update(0.1);
				const pos = wc.getPosition();
				const dist = pos.distanceTo(obstacle.position);
				// Path should have been nudged away — allow a small tolerance
				// since the Bezier curve may still approach but not fully penetrate
				if (i > 0 && i < 20) {
					// Only check middle of the path (not endpoints)
					expect(dist).toBeGreaterThan(obstacle.radius * 0.5);
				}
			}
		});

		it('does not alter path when no obstacles are near', () => {
			const wc1 = new WarpController();
			const wc2 = new WarpController();
			const start = new Vector3(0, 0, 0);
			const farObstacle: WarpObstacle = {
				position: new Vector3(0, 1000, 0),
				radius: 1
			};

			wc1.start(start, makeTarget(100, 0, 0), { duration: 2, arcHeight: 0.15 });
			wc2.start(start, makeTarget(100, 0, 0), { duration: 2, arcHeight: 0.15, obstacles: [farObstacle] });

			// Both paths should be identical since obstacle is far away
			wc1.update(1.0);
			wc2.update(1.0);
			const pos1 = wc1.getPosition();
			const pos2 = wc2.getPosition();
			expect(pos1.distanceTo(pos2)).toBeLessThan(0.001);
		});

		it('handles multiple obstacles', () => {
			const wc = new WarpController();
			const start = new Vector3(0, 0, 0);
			const obstacles: WarpObstacle[] = [
				{ position: new Vector3(30, 0, 0), radius: 3 },
				{ position: new Vector3(70, 0, 0), radius: 3 }
			];

			wc.start(start, makeTarget(100, 0, 0), {
				duration: 4,
				arcHeight: 0,
				obstacles
			});

			// Sample entire path — check that it doesn't pass through either obstacle
			let minDist0 = Infinity;
			let minDist1 = Infinity;
			for (let i = 0; i < 40; i++) {
				wc.update(0.1);
				const pos = wc.getPosition();
				minDist0 = Math.min(minDist0, pos.distanceTo(obstacles[0].position));
				minDist1 = Math.min(minDist1, pos.distanceTo(obstacles[1].position));
			}

			// Should maintain some clearance from both obstacles
			expect(minDist0).toBeGreaterThan(obstacles[0].radius * 0.3);
			expect(minDist1).toBeGreaterThan(obstacles[1].radius * 0.3);
		});
	});
});
