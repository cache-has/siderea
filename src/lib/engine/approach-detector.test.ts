import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3 } from 'three';
import {
	ApproachDetector,
	bodyTriggerRadius,
	bodyExitRadius,
	SATELLITE_TRIGGER_RADIUS,
	SATELLITE_EXIT_RADIUS
} from './approach-detector';
import type { ApproachCandidate } from './approach-detector';

describe('ApproachDetector', () => {
	let detector: ApproachDetector;

	beforeEach(() => {
		detector = new ApproachDetector();
	});

	function makeCandidate(
		key: string,
		position: Vector3,
		triggerRadius: number,
		exitRadius?: number
	): ApproachCandidate {
		return {
			key,
			name: key,
			kind: 'body',
			getPosition: () => position,
			triggerRadius,
			exitRadius: exitRadius ?? triggerRadius * 3
		};
	}

	it('returns null when no candidates are registered', () => {
		expect(detector.update(new Vector3(0, 0, 0))).toBeNull();
	});

	it('triggers when camera is within trigger radius', () => {
		detector.register(makeCandidate('earth', new Vector3(1, 0, 0), 0.1));
		const result = detector.update(new Vector3(1.05, 0, 0));
		expect(result).not.toBeNull();
		expect(result!.name).toBe('earth');
		expect(result!.distance).toBeCloseTo(0.05, 5);
	});

	it('does not trigger when camera is outside trigger radius', () => {
		detector.register(makeCandidate('earth', new Vector3(1, 0, 0), 0.1));
		const result = detector.update(new Vector3(0, 0, 0));
		expect(result).toBeNull();
	});

	it('enters cooldown after triggering', () => {
		detector.register(makeCandidate('earth', new Vector3(1, 0, 0), 0.1, 0.3));

		// First approach triggers
		const first = detector.update(new Vector3(1.05, 0, 0));
		expect(first).not.toBeNull();

		// Same position — still in cooldown, no re-trigger
		const second = detector.update(new Vector3(1.05, 0, 0));
		expect(second).toBeNull();
	});

	it('exits cooldown when camera moves beyond exit radius', () => {
		detector.register(makeCandidate('earth', new Vector3(1, 0, 0), 0.1, 0.3));

		// Trigger
		detector.update(new Vector3(1.05, 0, 0));

		// Move far away (beyond exit radius of 0.3)
		detector.update(new Vector3(2, 0, 0));

		// Approach again — should trigger
		const result = detector.update(new Vector3(1.05, 0, 0));
		expect(result).not.toBeNull();
		expect(result!.name).toBe('earth');
	});

	it('does not exit cooldown if camera is still within exit radius', () => {
		detector.register(makeCandidate('earth', new Vector3(1, 0, 0), 0.1, 0.3));

		// Trigger
		detector.update(new Vector3(1.05, 0, 0));

		// Move out of trigger but still within exit radius (0.3)
		detector.update(new Vector3(1.2, 0, 0));

		// Move back in — still in cooldown
		const result = detector.update(new Vector3(1.05, 0, 0));
		expect(result).toBeNull();
	});

	it('returns the closest candidate when multiple are in range', () => {
		detector.register(makeCandidate('mars', new Vector3(1, 0, 0), 0.5));
		detector.register(makeCandidate('earth', new Vector3(0.1, 0, 0), 0.5));

		const result = detector.update(new Vector3(0, 0, 0));
		expect(result).not.toBeNull();
		expect(result!.name).toBe('earth');
	});

	it('skips candidates with null position', () => {
		detector.register({
			key: 'ghost',
			name: 'Ghost',
			kind: 'body',
			getPosition: () => null,
			triggerRadius: 1,
			exitRadius: 3
		});
		expect(detector.update(new Vector3(0, 0, 0))).toBeNull();
	});

	it('unregisters candidates correctly', () => {
		detector.register(makeCandidate('earth', new Vector3(0, 0, 0), 1));
		detector.unregister('earth');
		expect(detector.candidateCount).toBe(0);
		expect(detector.update(new Vector3(0, 0, 0))).toBeNull();
	});

	it('replaces candidate with same key on re-register', () => {
		detector.register(makeCandidate('earth', new Vector3(10, 0, 0), 0.1));
		detector.register(makeCandidate('earth', new Vector3(0, 0, 0), 1));
		expect(detector.candidateCount).toBe(1);

		const result = detector.update(new Vector3(0.5, 0, 0));
		expect(result).not.toBeNull();
		expect(result!.name).toBe('earth');
	});

	it('resetCooldown allows re-triggering', () => {
		detector.register(makeCandidate('earth', new Vector3(0, 0, 0), 1, 3));
		detector.update(new Vector3(0, 0, 0)); // trigger
		detector.resetCooldown('earth');
		const result = detector.update(new Vector3(0, 0, 0));
		expect(result).not.toBeNull();
	});

	it('clear removes all candidates and cooldowns', () => {
		detector.register(makeCandidate('earth', new Vector3(0, 0, 0), 1));
		detector.update(new Vector3(0, 0, 0)); // trigger
		detector.clear();
		expect(detector.candidateCount).toBe(0);
		expect(detector.cooldownCount).toBe(0);
	});
});

describe('threshold helpers', () => {
	it('bodyTriggerRadius computes 5x exaggerated radius in AU', () => {
		// Earth: radius ~6371 km, exaggeration 200
		const trigger = bodyTriggerRadius(6371, 200);
		const expectedRadiusAU = (6371 / 1.495978707e8) * 200;
		expect(trigger).toBeCloseTo(expectedRadiusAU * 5, 6);
	});

	it('bodyTriggerRadius has minimum of 0.001 AU', () => {
		// Tiny body with tiny exaggeration
		const trigger = bodyTriggerRadius(1, 1);
		expect(trigger).toBe(0.001);
	});

	it('bodyExitRadius is 3x trigger radius', () => {
		expect(bodyExitRadius(0.1)).toBeCloseTo(0.3, 10);
	});

	it('satellite thresholds are reasonable constants', () => {
		expect(SATELLITE_TRIGGER_RADIUS).toBeGreaterThan(0);
		expect(SATELLITE_EXIT_RADIUS).toBeGreaterThan(SATELLITE_TRIGGER_RADIUS);
	});
});
