import { describe, it, expect } from 'vitest';
import { TransferFlight } from './transfer-flight';
import type { TransferPlan } from '$lib/renderer/transfer-orbit';
import { Vector3 } from 'three';

function makePlan(transferTime: number): TransferPlan {
	return {
		departureId: 3,
		arrivalId: 4,
		departureName: 'Earth',
		arrivalName: 'Mars',
		hohmann: {
			delta_v1: 2945,
			delta_v2: 2650,
			delta_v_total: 5595,
			transfer_time: transferTime,
			transfer_sma: 1.888e11,
			transfer_eccentricity: 0.208,
			phase_angle: 0.775,
			synodic_period: 7.8e7
		},
		departurePos: new Vector3(1, 0, 0),
		arrivalPos: new Vector3(-1.524, 0, 0),
		departureRadius: 4.26e-5,
		arrivalRadius: 2.27e-5,
		departureJD: 2460000,
		arrivalJD: 2460259
	};
}

describe('TransferFlight', () => {
	it('starts at progress 0 and active', () => {
		const flight = new TransferFlight(makePlan(1000), 1);
		expect(flight.progress).toBe(0);
		expect(flight.active).toBe(true);
		expect(flight.arrived).toBe(false);
	});

	it('advances progress based on sim delta', () => {
		const plan = makePlan(1000); // 1000 seconds transfer
		const flight = new TransferFlight(plan, 1);

		flight.tick(500); // half way
		expect(flight.progress).toBeCloseTo(0.5, 5);
		expect(flight.arrived).toBe(false);
	});

	it('completes at progress 1', () => {
		const plan = makePlan(1000);
		const flight = new TransferFlight(plan, 1);

		flight.tick(1000);
		expect(flight.progress).toBe(1);
		expect(flight.arrived).toBe(true);
		expect(flight.active).toBe(false);
	});

	it('clamps progress at 1 for overshoot', () => {
		const plan = makePlan(1000);
		const flight = new TransferFlight(plan, 1);

		flight.tick(2000); // overshoot
		expect(flight.progress).toBe(1);
	});

	it('stops advancing after arrival', () => {
		const plan = makePlan(1000);
		const flight = new TransferFlight(plan, 1);

		flight.tick(1000);
		const p = flight.progress;
		flight.tick(500);
		expect(flight.progress).toBe(p);
	});

	it('can be cancelled', () => {
		const flight = new TransferFlight(makePlan(1000), 1);
		flight.tick(100);
		flight.cancel();
		expect(flight.active).toBe(false);
	});

	it('computes correct time scale', () => {
		const plan = makePlan(45 * 86400); // 45 days in seconds
		const flight = new TransferFlight(plan, 1);
		// FLY_DURATION_SECONDS is 45, so timeScale = transferTime / 45
		expect(flight.requiredTimeScale).toBeCloseTo(86400, 0);
	});

	it('stores previous time scale', () => {
		const flight = new TransferFlight(makePlan(1000), 42);
		expect(flight.previousTimeScale).toBe(42);
	});
});
