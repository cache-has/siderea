import { describe, it, expect } from 'vitest';
import { computeDarkAdaptation, smoothAdaptation, type DarkAdaptationFactors } from './dark-adaptation';

describe('computeDarkAdaptation', () => {
	it('dims stars when very close to the Sun', () => {
		const factors = computeDarkAdaptation(0.1);
		expect(factors.starBrightness).toBeLessThan(0.3);
		expect(factors.bloomMultiplier).toBeGreaterThan(1.3);
		expect(factors.exposure).toBeLessThan(0.85);
	});

	it('returns near-normal values at Earth distance (1 AU)', () => {
		const factors = computeDarkAdaptation(1.0);
		expect(factors.starBrightness).toBeGreaterThan(0.4);
		expect(factors.starBrightness).toBeLessThan(1.0);
		expect(factors.bloomMultiplier).toBeGreaterThan(1.0);
		expect(factors.exposure).toBe(1.0);
	});

	it('returns normal brightness at outer solar system (10 AU)', () => {
		const factors = computeDarkAdaptation(10);
		expect(factors.starBrightness).toBeGreaterThan(0.95);
		expect(factors.bloomMultiplier).toBe(1.0);
		expect(factors.exposure).toBe(1.0);
	});

	it('enhances stars in interstellar space (>100 AU)', () => {
		const factors = computeDarkAdaptation(500);
		expect(factors.starBrightness).toBeGreaterThan(1.1);
		expect(factors.bloomMultiplier).toBe(1.0);
		expect(factors.exposure).toBe(1.0);
	});

	it('handles zero distance without errors', () => {
		const factors = computeDarkAdaptation(0);
		expect(factors.starBrightness).toBe(0.15);
		expect(Number.isFinite(factors.bloomMultiplier)).toBe(true);
		expect(Number.isFinite(factors.exposure)).toBe(true);
	});

	it('produces monotonically increasing star brightness with distance', () => {
		const distances = [0.1, 0.5, 1, 3, 10, 50, 200];
		const brightnesses = distances.map(d => computeDarkAdaptation(d).starBrightness);
		for (let i = 1; i < brightnesses.length; i++) {
			expect(brightnesses[i]).toBeGreaterThanOrEqual(brightnesses[i - 1]);
		}
	});
});

describe('smoothAdaptation', () => {
	it('moves current toward target over time', () => {
		const current: DarkAdaptationFactors = { starBrightness: 1.0, bloomMultiplier: 1.0, exposure: 1.0 };
		const target: DarkAdaptationFactors = { starBrightness: 0.5, bloomMultiplier: 1.5, exposure: 0.8 };

		smoothAdaptation(current, target, 0.5, 2.0);

		expect(current.starBrightness).toBeLessThan(1.0);
		expect(current.starBrightness).toBeGreaterThan(0.5);
		expect(current.bloomMultiplier).toBeGreaterThan(1.0);
		expect(current.bloomMultiplier).toBeLessThan(1.5);
	});

	it('converges fully with large dt', () => {
		const current: DarkAdaptationFactors = { starBrightness: 1.0, bloomMultiplier: 1.0, exposure: 1.0 };
		const target: DarkAdaptationFactors = { starBrightness: 0.2, bloomMultiplier: 1.8, exposure: 0.7 };

		smoothAdaptation(current, target, 100, 2.0);

		expect(current.starBrightness).toBeCloseTo(0.2, 2);
		expect(current.bloomMultiplier).toBeCloseTo(1.8, 2);
		expect(current.exposure).toBeCloseTo(0.7, 2);
	});

	it('does not change when target equals current', () => {
		const current: DarkAdaptationFactors = { starBrightness: 0.8, bloomMultiplier: 1.2, exposure: 0.9 };
		const target: DarkAdaptationFactors = { ...current };

		smoothAdaptation(current, target, 0.016);

		expect(current.starBrightness).toBe(0.8);
		expect(current.bloomMultiplier).toBe(1.2);
		expect(current.exposure).toBe(0.9);
	});
});
