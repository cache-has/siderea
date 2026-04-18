import { describe, it, expect } from 'vitest';
import { Scene } from 'three/webgpu';
import { BlackholeRenderer, schwarzschildRadiusKm } from './blackhole-renderer';
import type { BlackholeNO } from '$lib/data/types';

const SGR_A: BlackholeNO = {
	id: 'sgr_a_star',
	name: 'Sagittarius A*',
	catalog_ids: ['Sgr A*'],
	type: 'blackhole',
	subtype: 'supermassive',
	ra: 266.42,
	dec: -29.01,
	dist_pc: 8178,
	x: -446.6,
	y: -7138.0,
	z: -3966.0,
	mass_solar: 4_000_000,
	description: 'Supermassive black hole at the galactic center.',
	texture_ref: null
};

const CYG_X1: BlackholeNO = {
	id: 'cygnus_x1',
	name: 'Cygnus X-1',
	catalog_ids: ['Cyg X-1'],
	type: 'blackhole',
	subtype: 'stellar',
	ra: 299.59,
	dec: 35.2,
	dist_pc: 1860,
	x: 750.5,
	y: -1321.7,
	z: 1072.2,
	mass_solar: 21,
	description: 'First widely accepted stellar-mass black hole.',
	texture_ref: null
};

describe('schwarzschildRadiusKm', () => {
	it('computes correct radius for 1 solar mass', () => {
		// Rs ≈ 2.953 km for 1 M_sun
		expect(schwarzschildRadiusKm(1)).toBeCloseTo(2.953, 2);
	});

	it('computes correct radius for Sgr A* (4M solar)', () => {
		const rs = schwarzschildRadiusKm(4_000_000);
		// ~11.8 million km
		expect(rs).toBeCloseTo(11_812_000, -3);
	});

	it('scales linearly with mass', () => {
		expect(schwarzschildRadiusKm(10)).toBeCloseTo(schwarzschildRadiusKm(5) * 2, 2);
	});
});

describe('BlackholeRenderer', () => {
	it('creates groups for all black holes', () => {
		const renderer = new BlackholeRenderer([SGR_A, CYG_X1]);
		expect(renderer.items).toHaveLength(2);
		expect(renderer.items[0].id).toBe('sgr_a_star');
		expect(renderer.items[1].id).toBe('cygnus_x1');
		renderer.dispose();
	});

	it('filters non-blackhole objects', () => {
		const nebula = { ...SGR_A, type: 'nebula' as const, subtype: 'emission' as const, angular_size_arcmin: 10 };
		const renderer = new BlackholeRenderer([nebula as any, CYG_X1]);
		expect(renderer.items).toHaveLength(1);
		expect(renderer.items[0].id).toBe('cygnus_x1');
		renderer.dispose();
	});

	it('adds groups to a scene', () => {
		const renderer = new BlackholeRenderer([SGR_A, CYG_X1]);
		const scene = new Scene();
		renderer.addTo(scene);
		expect(scene.children).toHaveLength(2);
		renderer.dispose();
	});

	it('removes groups from a scene', () => {
		const renderer = new BlackholeRenderer([SGR_A]);
		const scene = new Scene();
		renderer.addTo(scene);
		renderer.removeFrom(scene);
		expect(scene.children).toHaveLength(0);
		renderer.dispose();
	});

	it('positions groups at catalog coordinates', () => {
		const renderer = new BlackholeRenderer([SGR_A]);
		const group = renderer.getGroup('sgr_a_star');
		expect(group).toBeDefined();
		expect(group!.position.x).toBeCloseTo(-446.6, 1);
		expect(group!.position.y).toBeCloseTo(-7138.0, 1);
		expect(group!.position.z).toBeCloseTo(-3966.0, 1);
		renderer.dispose();
	});

	it('creates lensing sphere for supermassive only', () => {
		const renderer = new BlackholeRenderer([SGR_A, CYG_X1]);
		const smGroup = renderer.getGroup('sgr_a_star')!;
		const stellarGroup = renderer.getGroup('cygnus_x1')!;

		// Supermassive: event horizon + disk + lens + glow = 4 children
		expect(smGroup.children.length).toBe(4);
		// Stellar: event horizon + disk + glow = 3 children
		expect(stellarGroup.children.length).toBe(3);
		renderer.dispose();
	});

	it('handles empty input', () => {
		const renderer = new BlackholeRenderer([]);
		expect(renderer.items).toHaveLength(0);
		renderer.dispose();
	});
});
