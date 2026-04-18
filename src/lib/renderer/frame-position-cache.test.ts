import { describe, it, expect, vi } from 'vitest';
import { FramePositionCache } from './frame-position-cache';
import { METERS_PER_AU } from './scale';

function makeMockWasm() {
	return {
		get_positions_batch: vi.fn().mockReturnValue(new Float64Array([
			0, 0, 0,                                    // Sun (id=0)
			METERS_PER_AU, 0, 0,                         // Mercury-ish (id=1)
			0, METERS_PER_AU * 2, METERS_PER_AU * 0.5    // Earth-ish (id=3)
		])),
		get_satellite_positions_batch: vi.fn().mockReturnValue(new Float64Array([
			384400e3, 0, 0    // Moon (id=301)
		]))
	};
}

describe('FramePositionCache', () => {
	it('batches body positions into a single WASM call', () => {
		const wasm = makeMockWasm();
		const cache = new FramePositionCache(wasm);

		cache.setBodyIds([0, 1, 3]);
		cache.compute(2451545.0);

		expect(wasm.get_positions_batch).toHaveBeenCalledTimes(1);
		expect(wasm.get_positions_batch).toHaveBeenCalledWith(
			new Uint32Array([0, 1, 3]),
			2451545.0
		);
	});

	it('returns body positions in AU', () => {
		const wasm = makeMockWasm();
		const cache = new FramePositionCache(wasm);

		cache.setBodyIds([0, 1, 3]);
		cache.compute(2451545.0);

		const sun = cache.getBodyPositionAU(0);
		expect(sun).toEqual({ x: 0, y: 0, z: 0 });

		const mercury = cache.getBodyPositionAU(1);
		expect(mercury!.x).toBeCloseTo(1.0, 5);
		expect(mercury!.y).toBeCloseTo(0, 5);

		const earth = cache.getBodyPositionAU(3);
		expect(earth!.x).toBeCloseTo(0, 5);
		expect(earth!.y).toBeCloseTo(2.0, 5);
	});

	it('returns body positions in meters', () => {
		const wasm = makeMockWasm();
		const cache = new FramePositionCache(wasm);

		cache.setBodyIds([0, 1, 3]);
		cache.compute(2451545.0);

		const mercury = cache.getBodyPositionMeters(1);
		expect(mercury!.x).toBeCloseTo(METERS_PER_AU, 1);
	});

	it('returns undefined for unregistered body IDs', () => {
		const wasm = makeMockWasm();
		const cache = new FramePositionCache(wasm);

		cache.setBodyIds([0, 1, 3]);
		cache.compute(2451545.0);

		expect(cache.getBodyPositionAU(999)).toBeUndefined();
	});

	it('batches moon positions into a single WASM call', () => {
		const wasm = makeMockWasm();
		const cache = new FramePositionCache(wasm);

		cache.setMoonIds([301]);
		cache.compute(2451545.0);

		expect(wasm.get_satellite_positions_batch).toHaveBeenCalledTimes(1);
		const moon = cache.getMoonPositionMeters(301);
		expect(moon!.x).toBeCloseTo(384400e3, 0);
	});

	it('handles NaN positions (unknown bodies)', () => {
		const wasm = {
			get_positions_batch: vi.fn().mockReturnValue(new Float64Array([NaN, NaN, NaN])),
			get_satellite_positions_batch: vi.fn().mockReturnValue(new Float64Array(0))
		};
		const cache = new FramePositionCache(wasm);

		cache.setBodyIds([99999]);
		cache.compute(2451545.0);

		expect(cache.getBodyPositionAU(99999)).toBeUndefined();
	});

	it('skips WASM calls when no IDs are registered', () => {
		const wasm = makeMockWasm();
		const cache = new FramePositionCache(wasm);

		cache.compute(2451545.0);

		expect(wasm.get_positions_batch).not.toHaveBeenCalled();
		expect(wasm.get_satellite_positions_batch).not.toHaveBeenCalled();
	});

	it('records timing', () => {
		const wasm = makeMockWasm();
		const cache = new FramePositionCache(wasm);

		cache.setBodyIds([0, 1, 3]);
		cache.compute(2451545.0);

		expect(cache.wasmTimeUs).toBeGreaterThanOrEqual(0);
	});
});
