import { describe, it, expect } from 'vitest';
import {
	magnitudeToSize,
	magnitudeToAlpha,
	computeStarAttributes,
	cameraDistanceToMagCutoff,
	magCutoffToVisibleCount
} from './star-field';
import type { StarCatalogData } from '$lib/data/types';

describe('magnitudeToSize', () => {
	const base = 4;
	const ref = 2.0;
	const min = 0.5;
	const max = 24;

	it('returns baseSize at reference magnitude', () => {
		expect(magnitudeToSize(ref, base, ref, min, max)).toBeCloseTo(base, 5);
	});

	it('brighter stars (lower mag) produce larger sizes', () => {
		const bright = magnitudeToSize(-1.0, base, ref, min, max);
		const dim = magnitudeToSize(6.0, base, ref, min, max);
		expect(bright).toBeGreaterThan(dim);
	});

	it('clamps to minSize for very dim stars', () => {
		const veryDim = magnitudeToSize(20.0, base, ref, min, max);
		expect(veryDim).toBe(min);
	});

	it('clamps to maxSize for very bright stars', () => {
		const veryBright = magnitudeToSize(-10.0, base, ref, min, max);
		expect(veryBright).toBe(max);
	});

	it('Sirius (mag -1.46) is larger than Polaris (mag 1.98)', () => {
		const sirius = magnitudeToSize(-1.46, base, ref, min, max);
		const polaris = magnitudeToSize(1.98, base, ref, min, max);
		expect(sirius).toBeGreaterThan(polaris);
	});
});

describe('magnitudeToAlpha', () => {
	const ref = 2.0;
	const minAlpha = 0.15;
	const fade = 12.0;

	it('returns 1.0 for stars at or brighter than reference', () => {
		expect(magnitudeToAlpha(ref, ref, minAlpha, fade)).toBe(1.0);
		expect(magnitudeToAlpha(-1.0, ref, minAlpha, fade)).toBe(1.0);
	});

	it('returns minAlpha at fade magnitude', () => {
		expect(magnitudeToAlpha(fade, ref, minAlpha, fade)).toBeCloseTo(minAlpha, 5);
	});

	it('fades linearly between reference and fade magnitudes', () => {
		const mid = (ref + fade) / 2;
		const alpha = magnitudeToAlpha(mid, ref, minAlpha, fade);
		const expected = 1.0 - 0.5 * (1.0 - minAlpha);
		expect(alpha).toBeCloseTo(expected, 5);
	});
});

describe('cameraDistanceToMagCutoff', () => {
	it('returns 12 (show all) when camera is very close', () => {
		expect(cameraDistanceToMagCutoff(0.5)).toBe(12.0);
		expect(cameraDistanceToMagCutoff(1.0)).toBe(12.0);
	});

	it('returns 2 (bright only) when camera is very far', () => {
		expect(cameraDistanceToMagCutoff(10000)).toBe(2.0);
		expect(cameraDistanceToMagCutoff(50000)).toBe(2.0);
	});

	it('decreases monotonically with distance', () => {
		const distances = [1, 10, 100, 1000, 10000];
		const cutoffs = distances.map(cameraDistanceToMagCutoff);
		for (let i = 1; i < cutoffs.length; i++) {
			expect(cutoffs[i]).toBeLessThanOrEqual(cutoffs[i - 1]);
		}
	});

	it('returns intermediate values at mid distances', () => {
		const mid = cameraDistanceToMagCutoff(100);
		expect(mid).toBeGreaterThan(2.0);
		expect(mid).toBeLessThan(12.0);
	});
});

describe('magCutoffToVisibleCount', () => {
	// Build a 500-element sorted array spanning mag -2 to 12
	// Must exceed the 100-star minimum floor so binary search results are testable.
	const N = 500;
	const sorted = new Float32Array(N);
	for (let i = 0; i < N; i++) sorted[i] = -2 + (i / (N - 1)) * 14; // -2 to 12

	it('returns all stars when cutoff exceeds max magnitude', () => {
		expect(magCutoffToVisibleCount(sorted, 12.0)).toBe(N);
	});

	it('returns fewer stars when cutoff is low', () => {
		// cutoff=2.0, margin=1.0 → target=3.0
		// Stars with mag ≤ 3.0: (3 - (-2)) / 14 * 500 ≈ 179
		const count = magCutoffToVisibleCount(sorted, 2.0);
		expect(count).toBeGreaterThan(150);
		expect(count).toBeLessThan(220);
	});

	it('enforces minimum count of 100 for very low cutoff', () => {
		// cutoff=-10 + margin=1 → target=-9, no stars qualify → min floor kicks in
		expect(magCutoffToVisibleCount(sorted, -10.0)).toBe(100);
	});

	it('respects custom margin', () => {
		// Narrow (margin=0): target=2.0 → ~143 stars
		// Wide (margin=3): target=5.0 → ~250 stars
		const countNarrow = magCutoffToVisibleCount(sorted, 2.0, 0.0);
		const countWide = magCutoffToVisibleCount(sorted, 2.0, 3.0);
		expect(countWide).toBeGreaterThan(countNarrow);
	});

	it('handles large catalog sizes', () => {
		const large = new Float32Array(10000);
		for (let i = 0; i < 10000; i++) large[i] = (i / 10000) * 14 - 2; // -2 to 12
		// cutoff=6 + margin=1 = 7 → ~64% of range
		const count = magCutoffToVisibleCount(large, 6.0);
		expect(count).toBeGreaterThan(5000);
		expect(count).toBeLessThan(8000);
	});

	it('returns array length for small catalogs regardless of cutoff', () => {
		// With only 8 stars, min(100, 8) = 8 always wins
		const small = new Float32Array([-1, 0, 1, 2, 3, 4, 5, 6]);
		expect(magCutoffToVisibleCount(small, 0.0)).toBe(8);
	});
});

describe('computeStarAttributes', () => {
	function makeMockData(count: number): StarCatalogData {
		return {
			count,
			positions: new Float32Array(count * 3),
			apparentMag: new Float32Array(count).map((_, i) => i * 2.0 - 1.0), // -1, 1, 3, ...
			absoluteMag: new Float32Array(count),
			colorIndex: new Uint8Array(count).map((_, i) => i * 50), // varying B-V
			pmRA: new Float32Array(count),
			pmDec: new Float32Array(count)
		};
	}

	it('produces correctly sized output arrays', () => {
		const data = makeMockData(5);
		const opts = {
			baseSize: 4,
			referenceMag: 2.0,
			minSize: 0.5,
			maxSize: 24,
			minAlpha: 0.15,
			fadeMag: 12.0
		};
		const { colors, sizes, alphas } = computeStarAttributes(data, opts);

		expect(colors.length).toBe(15); // 5 * 3
		expect(sizes.length).toBe(5);
		expect(alphas.length).toBe(5);
	});

	it('produces valid color values in [0, 1]', () => {
		const data = makeMockData(10);
		const opts = {
			baseSize: 4,
			referenceMag: 2.0,
			minSize: 0.5,
			maxSize: 24,
			minAlpha: 0.15,
			fadeMag: 12.0
		};
		const { colors } = computeStarAttributes(data, opts);

		for (let i = 0; i < colors.length; i++) {
			expect(colors[i]).toBeGreaterThanOrEqual(0);
			expect(colors[i]).toBeLessThanOrEqual(1);
		}
	});

	it('produces valid size and alpha values', () => {
		const data = makeMockData(10);
		const opts = {
			baseSize: 4,
			referenceMag: 2.0,
			minSize: 0.5,
			maxSize: 24,
			minAlpha: 0.15,
			fadeMag: 12.0
		};
		const { sizes, alphas } = computeStarAttributes(data, opts);

		for (let i = 0; i < sizes.length; i++) {
			expect(sizes[i]).toBeGreaterThanOrEqual(opts.minSize);
			expect(sizes[i]).toBeLessThanOrEqual(opts.maxSize);
		}
		for (let i = 0; i < alphas.length; i++) {
			expect(alphas[i]).toBeGreaterThanOrEqual(opts.minAlpha);
			expect(alphas[i]).toBeLessThanOrEqual(1.0);
		}
	});
});
