import { describe, it, expect } from 'vitest';
import {
	BODY_TEXTURES,
	MOON_TEXTURES,
	RING_TEXTURES,
	LOD_TIERS,
	textureUrl,
	tierForDistance
} from './texture-manifest';

describe('texture-manifest', () => {
	it('has textures for all 8 planets', () => {
		for (let naifId = 1; naifId <= 8; naifId++) {
			expect(BODY_TEXTURES[naifId]).toBeDefined();
			expect(BODY_TEXTURES[naifId].color.filename).toBeTruthy();
		}
	});

	it('has textures for dwarf planets', () => {
		for (const naifId of [9, 10, 11, 12, 13]) {
			expect(BODY_TEXTURES[naifId]).toBeDefined();
		}
	});

	it('has Earth night and cloud maps', () => {
		const earth = BODY_TEXTURES[3];
		expect(earth.night).toBeDefined();
		expect(earth.clouds).toBeDefined();
	});

	it('has Moon texture', () => {
		expect(MOON_TEXTURES[301]).toBeDefined();
	});

	it('has Saturn ring texture', () => {
		expect(RING_TEXTURES[6]).toBeDefined();
	});

	it('LOD_TIERS are ascending', () => {
		for (let i = 1; i < LOD_TIERS.length; i++) {
			expect(LOD_TIERS[i]).toBeGreaterThan(LOD_TIERS[i - 1]);
		}
	});
});

describe('textureUrl', () => {
	it('builds correct path', () => {
		expect(textureUrl('earth_daymap', 512)).toBe('/textures/512/earth_daymap.webp');
		expect(textureUrl('moon', 2048)).toBe('/textures/2048/moon.webp');
		expect(textureUrl('saturn_ring_alpha', 128)).toBe('/textures/128/saturn_ring_alpha.webp');
	});
});

describe('tierForDistance', () => {
	it('returns 2048 for very close distances', () => {
		expect(tierForDistance(0.001)).toBe(2048);
		expect(tierForDistance(0.0001)).toBe(2048);
	});

	it('returns 512 for medium distances', () => {
		expect(tierForDistance(0.005)).toBe(512);
	});

	it('returns 128 for far distances', () => {
		expect(tierForDistance(0.05)).toBe(128);
		expect(tierForDistance(1.0)).toBe(128);
	});

	it('returns correct tier at exact boundaries', () => {
		expect(tierForDistance(0.002)).toBe(512); // exactly at boundary → medium
		expect(tierForDistance(0.01)).toBe(128);  // exactly at boundary → far
	});
});
