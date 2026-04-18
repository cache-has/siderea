import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three/webgpu';
import {
	ScaleSpace,
	AU_PER_PARSEC,
	METERS_PER_AU,
	METERS_PER_PARSEC,
	nearToFar,
	farToNear,
	metersToUnit,
	unitToMeters
} from './scale';

describe('scale constants', () => {
	it('AU_PER_PARSEC matches IAU definition (648000/π)', () => {
		expect(AU_PER_PARSEC).toBeCloseTo(648000 / Math.PI, 3);
	});

	it('METERS_PER_PARSEC = AU_PER_PARSEC * METERS_PER_AU', () => {
		expect(METERS_PER_PARSEC).toBeCloseTo(AU_PER_PARSEC * METERS_PER_AU, 0);
	});

	it('1 parsec ≈ 3.086e16 m', () => {
		expect(METERS_PER_PARSEC).toBeCloseTo(3.0856775814913673e16, -10);
	});
});

describe('nearToFar / farToNear', () => {
	it('converts 1 parsec in AU to 1 parsec', () => {
		const au = new Vector3(AU_PER_PARSEC, 0, 0);
		const pc = nearToFar(au);
		expect(pc.x).toBeCloseTo(1, 8);
		expect(pc.y).toBe(0);
		expect(pc.z).toBe(0);
	});

	it('round-trips nearToFar → farToNear', () => {
		const original = new Vector3(100, -50, 200);
		const pc = nearToFar(original);
		const back = farToNear(pc);
		expect(back.x).toBeCloseTo(original.x, 6);
		expect(back.y).toBeCloseTo(original.y, 6);
		expect(back.z).toBeCloseTo(original.z, 6);
	});

	it('writes to output vector when provided', () => {
		const input = new Vector3(AU_PER_PARSEC, 0, 0);
		const out = new Vector3();
		const result = nearToFar(input, out);
		expect(result).toBe(out);
		expect(out.x).toBeCloseTo(1, 8);
	});

	it('does not mutate input vector', () => {
		const input = new Vector3(100, 200, 300);
		nearToFar(input);
		expect(input.x).toBe(100);
		expect(input.y).toBe(200);
		expect(input.z).toBe(300);
	});
});

describe('metersToUnit / unitToMeters', () => {
	it('1 AU in meters → 1 in near-space', () => {
		expect(metersToUnit(METERS_PER_AU, ScaleSpace.NEAR)).toBeCloseTo(1, 8);
	});

	it('1 parsec in meters → 1 in far-space', () => {
		expect(metersToUnit(METERS_PER_PARSEC, ScaleSpace.FAR)).toBeCloseTo(1, 8);
	});

	it('background space is passthrough (meters)', () => {
		expect(metersToUnit(42, ScaleSpace.BACKGROUND)).toBe(42);
		expect(unitToMeters(42, ScaleSpace.BACKGROUND)).toBe(42);
	});

	it('round-trips metersToUnit → unitToMeters', () => {
		const meters = 1e15;
		for (const space of [ScaleSpace.NEAR, ScaleSpace.FAR, ScaleSpace.BACKGROUND]) {
			const units = metersToUnit(meters, space);
			expect(unitToMeters(units, space)).toBeCloseTo(meters, -5);
		}
	});
});
