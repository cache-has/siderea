/**
 * Per-frame cache for batched WASM position queries.
 *
 * Instead of each renderer making individual WASM calls per body per frame,
 * all body IDs are collected and positions are fetched in two batch calls:
 *   1. `get_positions_batch()` — heliocentric positions for planets, dwarf planets, comets, etc.
 *   2. `get_satellite_positions_batch()` — parent-centric positions for moons
 *
 * This reduces JS↔WASM boundary crossings from ~36+ calls/frame to 2.
 */

import { METERS_PER_AU } from './scale';

/** WASM batch interface — the two batch functions we need. */
export interface WasmBatchEphemeris {
	get_positions_batch(body_ids: Uint32Array, julian_date: number): Float64Array;
	get_satellite_positions_batch(moon_ids: Uint32Array, julian_date: number): Float64Array;
}

/** A cached 3D position in AU (heliocentric) or meters (parent-centric). */
export interface CachedPosition {
	x: number;
	y: number;
	z: number;
}

export class FramePositionCache {
	private wasm: WasmBatchEphemeris;

	/** Body ID → index in the batch result. */
	private bodyIdToIndex = new Map<number, number>();
	/** Moon ID → index in the satellite batch result. */
	private moonIdToIndex = new Map<number, number>();

	/** Pre-allocated Uint32Arrays for batch calls. */
	private bodyIdsArray: Uint32Array = new Uint32Array(0);
	private moonIdsArray: Uint32Array = new Uint32Array(0);

	/** Cached results from latest compute(). */
	private bodyPositions: Float64Array = new Float64Array(0);
	private moonPositions: Float64Array = new Float64Array(0);

	/** Timing for the latest compute() call (microseconds). */
	wasmTimeUs = 0;

	constructor(wasm: WasmBatchEphemeris) {
		this.wasm = wasm;
	}

	/**
	 * Register the set of body IDs that will be queried each frame.
	 * Call once at setup or when the set of active bodies changes.
	 */
	setBodyIds(ids: number[]): void {
		this.bodyIdToIndex.clear();
		this.bodyIdsArray = new Uint32Array(ids.length);
		for (let i = 0; i < ids.length; i++) {
			this.bodyIdsArray[i] = ids[i];
			this.bodyIdToIndex.set(ids[i], i);
		}
	}

	/**
	 * Register the set of moon IDs that will be queried each frame.
	 * Call once at setup or when the set of active moons changes.
	 */
	setMoonIds(ids: number[]): void {
		this.moonIdToIndex.clear();
		this.moonIdsArray = new Uint32Array(ids.length);
		for (let i = 0; i < ids.length; i++) {
			this.moonIdsArray[i] = ids[i];
			this.moonIdToIndex.set(ids[i], i);
		}
	}

	/**
	 * Fetch all positions for this frame in two batch WASM calls.
	 * Call once per frame before any renderer reads positions.
	 */
	compute(jd: number): void {
		const t0 = performance.now();

		if (this.bodyIdsArray.length > 0) {
			this.bodyPositions = this.wasm.get_positions_batch(this.bodyIdsArray, jd);
		}
		if (this.moonIdsArray.length > 0) {
			this.moonPositions = this.wasm.get_satellite_positions_batch(this.moonIdsArray, jd);
		}

		this.wasmTimeUs = (performance.now() - t0) * 1000;
	}

	/**
	 * Get a body's heliocentric position in AU.
	 * Returns undefined if the body ID wasn't registered or position is NaN.
	 */
	getBodyPositionAU(naifId: number): CachedPosition | undefined {
		const idx = this.bodyIdToIndex.get(naifId);
		if (idx === undefined) return undefined;
		const base = idx * 3;
		const x = this.bodyPositions[base];
		if (Number.isNaN(x)) return undefined;
		return {
			x: x / METERS_PER_AU,
			y: this.bodyPositions[base + 1] / METERS_PER_AU,
			z: this.bodyPositions[base + 2] / METERS_PER_AU
		};
	}

	/**
	 * Get a body's heliocentric position in meters (raw WASM output).
	 * Returns undefined if the body ID wasn't registered or position is NaN.
	 */
	getBodyPositionMeters(naifId: number): CachedPosition | undefined {
		const idx = this.bodyIdToIndex.get(naifId);
		if (idx === undefined) return undefined;
		const base = idx * 3;
		const x = this.bodyPositions[base];
		if (Number.isNaN(x)) return undefined;
		return {
			x,
			y: this.bodyPositions[base + 1],
			z: this.bodyPositions[base + 2]
		};
	}

	/**
	 * Get a moon's parent-centric position in meters.
	 * Returns undefined if the moon ID wasn't registered or position is NaN.
	 */
	getMoonPositionMeters(moonId: number): CachedPosition | undefined {
		const idx = this.moonIdToIndex.get(moonId);
		if (idx === undefined) return undefined;
		const base = idx * 3;
		const x = this.moonPositions[base];
		if (Number.isNaN(x)) return undefined;
		return {
			x,
			y: this.moonPositions[base + 1],
			z: this.moonPositions[base + 2]
		};
	}
}
