import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three/webgpu';
import {
	GALACTIC_NORTH_POLE,
	GALACTIC_CENTER_DIR,
	GALACTIC_CENTER_POS,
	GALACTIC_CENTER_DIST_PC,
	GALACTIC_PLANE_QUATERNION,
	ECLIPTIC_NORTH_POLE,
	DISK_RADIUS_PC,
	LY_PER_PARSEC,
	pcToLy,
	lyToPc,
	galacticLatitude,
	galacticLongitude,
	eclipticLatitude,
	eclipticLongitude
} from './galactic-constants';

describe('galactic coordinate constants', () => {
	it('galactic north pole is a unit vector', () => {
		expect(GALACTIC_NORTH_POLE.length()).toBeCloseTo(1, 8);
	});

	it('galactic center direction is a unit vector', () => {
		expect(GALACTIC_CENTER_DIR.length()).toBeCloseTo(1, 8);
	});

	it('galactic north pole is perpendicular to galactic center direction', () => {
		// The galactic center lies in the galactic plane, so dot product ≈ 0
		const dot = GALACTIC_NORTH_POLE.dot(GALACTIC_CENTER_DIR);
		expect(Math.abs(dot)).toBeLessThan(0.01);
	});

	it('galactic center position has correct distance', () => {
		expect(GALACTIC_CENTER_POS.length()).toBeCloseTo(GALACTIC_CENTER_DIST_PC, 1);
	});

	it('galactic center position matches Sgr A* coordinates', () => {
		// Known Sgr A* position: RA≈266.42°, Dec≈-29.01°, d≈8178 pc
		expect(GALACTIC_CENTER_POS.x).toBeCloseTo(-446.6, 0);
		expect(GALACTIC_CENTER_POS.y).toBeCloseTo(-7138.0, 0);
		expect(GALACTIC_CENTER_POS.z).toBeCloseTo(-3966.0, 0);
	});
});

describe('galactic plane quaternion', () => {
	it('rotates +Z to galactic north pole direction', () => {
		const z = new Vector3(0, 0, 1);
		z.applyQuaternion(GALACTIC_PLANE_QUATERNION);
		expect(z.x).toBeCloseTo(GALACTIC_NORTH_POLE.x, 5);
		expect(z.y).toBeCloseTo(GALACTIC_NORTH_POLE.y, 5);
		expect(z.z).toBeCloseTo(GALACTIC_NORTH_POLE.z, 5);
	});

	it('is a unit quaternion', () => {
		expect(GALACTIC_PLANE_QUATERNION.length()).toBeCloseTo(1, 8);
	});
});

describe('galacticLatitude', () => {
	it('returns 0 for a direction in the galactic plane', () => {
		// Galactic center direction lies in the galactic plane
		expect(galacticLatitude(GALACTIC_CENTER_DIR)).toBeCloseTo(0, 1);
	});

	it('returns +π/2 for galactic north pole', () => {
		expect(galacticLatitude(GALACTIC_NORTH_POLE)).toBeCloseTo(Math.PI / 2, 5);
	});

	it('returns -π/2 for galactic south pole', () => {
		const south = GALACTIC_NORTH_POLE.clone().negate();
		expect(galacticLatitude(south)).toBeCloseTo(-Math.PI / 2, 5);
	});
});

describe('galacticLongitude', () => {
	it('returns 0 for galactic center direction', () => {
		expect(galacticLongitude(GALACTIC_CENTER_DIR)).toBeCloseTo(0, 2);
	});

	it('returns π for anti-center direction', () => {
		const antiCenter = GALACTIC_CENTER_DIR.clone().negate();
		const lon = galacticLongitude(antiCenter);
		expect(Math.abs(lon)).toBeCloseTo(Math.PI, 2);
	});
});

describe('ecliptic north pole', () => {
	it('is a unit vector', () => {
		expect(ECLIPTIC_NORTH_POLE.length()).toBeCloseTo(1, 8);
	});

	it('is tilted ~23.4° from celestial north (+Z)', () => {
		// Ecliptic obliquity ≈ 23.4393°
		const dotZ = ECLIPTIC_NORTH_POLE.z;
		const angleFromZ = Math.acos(dotZ) * (180 / Math.PI);
		expect(angleFromZ).toBeCloseTo(23.4393, 1);
	});

	it('is not aligned with galactic north pole', () => {
		const dot = ECLIPTIC_NORTH_POLE.dot(GALACTIC_NORTH_POLE);
		// They should be at ~60° angle
		expect(Math.abs(dot)).toBeLessThan(0.9);
		expect(Math.abs(dot)).toBeGreaterThan(0.1);
	});
});

describe('eclipticLatitude', () => {
	it('returns +π/2 for ecliptic north pole', () => {
		expect(eclipticLatitude(ECLIPTIC_NORTH_POLE)).toBeCloseTo(Math.PI / 2, 5);
	});

	it('returns -π/2 for ecliptic south pole', () => {
		const south = ECLIPTIC_NORTH_POLE.clone().negate();
		expect(eclipticLatitude(south)).toBeCloseTo(-Math.PI / 2, 5);
	});

	it('returns ~0 for a direction in the ecliptic plane', () => {
		// Vernal equinox direction (+X) lies in the ecliptic plane
		const vernal = new Vector3(1, 0, 0);
		expect(Math.abs(eclipticLatitude(vernal))).toBeLessThan(0.01);
	});
});

describe('eclipticLongitude', () => {
	it('returns 0 for vernal equinox direction (+X)', () => {
		const vernal = new Vector3(1, 0, 0);
		expect(eclipticLongitude(vernal)).toBeCloseTo(0, 2);
	});

	it('returns π for anti-vernal direction (-X)', () => {
		const antiVernal = new Vector3(-1, 0, 0);
		expect(eclipticLongitude(antiVernal)).toBeCloseTo(Math.PI, 2);
	});

	it('returns value in [0, 2π)', () => {
		// Test various directions
		const dirs = [
			new Vector3(1, 0, 0),
			new Vector3(0, 1, 0),
			new Vector3(-1, 0, 0),
			new Vector3(0, -1, 0),
			new Vector3(1, 1, 0).normalize()
		];
		for (const d of dirs) {
			const lon = eclipticLongitude(d);
			expect(lon).toBeGreaterThanOrEqual(0);
			expect(lon).toBeLessThan(2 * Math.PI + 0.001);
		}
	});
});

describe('parsec ↔ light-year conversion', () => {
	it('1 parsec ≈ 3.26 light-years', () => {
		expect(LY_PER_PARSEC).toBeCloseTo(3.26156, 3);
	});

	it('round-trips pcToLy → lyToPc', () => {
		const pc = 1234.5;
		expect(lyToPc(pcToLy(pc))).toBeCloseTo(pc, 8);
	});

	it('disk radius is 15 kpc', () => {
		expect(DISK_RADIUS_PC).toBe(15000);
	});
});
