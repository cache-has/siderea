import { describe, it, expect } from 'vitest';
import { Scene } from 'three/webgpu';
import { ClusterRenderer } from './cluster-renderer';
import type { ClusterNO } from '$lib/data/types';

const PLEIADES: ClusterNO = {
	id: 'mel_22',
	name: 'Pleiades',
	catalog_ids: ['M45', 'Melotte 22'],
	type: 'cluster',
	subtype: 'open',
	ra: 56.75,
	dec: 24.12,
	dist_pc: 136,
	x: 73.8,
	y: 96.2,
	z: 55.6,
	angular_size_arcmin: 110,
	star_count: 1000,
	age_myr: 115,
	metallicity_fe_h: null,
	description: 'Famous open cluster in Taurus.',
	texture_ref: null
};

const M13: ClusterNO = {
	id: 'ngc_6205',
	name: 'Great Globular Cluster in Hercules',
	catalog_ids: ['M13', 'NGC 6205'],
	type: 'cluster',
	subtype: 'globular',
	ra: 250.42,
	dec: 36.46,
	dist_pc: 6800,
	x: -1832.8,
	y: -5152.8,
	z: 4041.0,
	angular_size_arcmin: 20,
	star_count: 300000,
	age_myr: 11650,
	metallicity_fe_h: -1.53,
	description: 'Best-known globular cluster in the northern sky.',
	texture_ref: null
};

const OMEGA_CEN: ClusterNO = {
	id: 'ngc_5139',
	name: 'Omega Centauri',
	catalog_ids: ['NGC 5139'],
	type: 'cluster',
	subtype: 'globular',
	ra: 201.69,
	dec: -47.48,
	dist_pc: 5430,
	x: -3300.0,
	y: -2600.0,
	z: -4010.0,
	angular_size_arcmin: 36,
	star_count: 10000000,
	age_myr: 11500,
	metallicity_fe_h: -1.53,
	description: 'Largest globular cluster in the Milky Way.',
	texture_ref: null
};

describe('ClusterRenderer', () => {
	it('creates sprites for all clusters', () => {
		const renderer = new ClusterRenderer([PLEIADES, M13, OMEGA_CEN]);
		expect(renderer.items).toHaveLength(3);
		expect(renderer.items[0].id).toBe('mel_22');
		renderer.dispose();
	});

	it('filters non-cluster objects', () => {
		const nebula = { ...PLEIADES, type: 'nebula' as const, subtype: 'emission' as const };
		const renderer = new ClusterRenderer([nebula as any, M13]);
		expect(renderer.items).toHaveLength(1);
		expect(renderer.items[0].id).toBe('ngc_6205');
		renderer.dispose();
	});

	it('adds sprites to a scene', () => {
		const renderer = new ClusterRenderer([PLEIADES, M13]);
		const scene = new Scene();
		renderer.addTo(scene);
		expect(scene.children).toHaveLength(2);
		renderer.dispose();
	});

	it('removes sprites from a scene', () => {
		const renderer = new ClusterRenderer([PLEIADES]);
		const scene = new Scene();
		renderer.addTo(scene);
		renderer.removeFrom(scene);
		expect(scene.children).toHaveLength(0);
		renderer.dispose();
	});

	it('positions sprites at catalog coordinates', () => {
		const renderer = new ClusterRenderer([M13]);
		const sprite = renderer.getSprite('ngc_6205');
		expect(sprite).toBeDefined();
		expect(sprite!.position.x).toBeCloseTo(-1832.8, 1);
		expect(sprite!.position.y).toBeCloseTo(-5152.8, 1);
		expect(sprite!.position.z).toBeCloseTo(4041.0, 1);
		renderer.dispose();
	});

	it('enforces minimum visual size', () => {
		// M13: 20 arcmin at 6800 pc → physical ~39.6 pc diameter
		// With sizeScale 1.2, radius ~ 23.7 pc — above default minVisualRadius of 3
		// Use a small cluster to test minimum enforcement
		const tiny: ClusterNO = {
			...PLEIADES,
			angular_size_arcmin: 0.1,
			dist_pc: 10
		};
		const renderer = new ClusterRenderer([tiny], { minVisualRadius: 3.0 });
		const sprite = renderer.getSprite('mel_22');
		// Scale should be >= minVisualRadius * 2 = 6.0
		expect(sprite!.scale.x).toBeGreaterThanOrEqual(6.0);
		renderer.dispose();
	});

	it('handles empty input', () => {
		const renderer = new ClusterRenderer([]);
		expect(renderer.items).toHaveLength(0);
		renderer.dispose();
	});

	it('handles both open and globular subtypes', () => {
		const renderer = new ClusterRenderer([PLEIADES, M13]);
		const openSprite = renderer.getSprite('mel_22');
		const globSprite = renderer.getSprite('ngc_6205');
		expect(openSprite).toBeDefined();
		expect(globSprite).toBeDefined();
		// Both should have positive scale
		expect(openSprite!.scale.x).toBeGreaterThan(0);
		expect(globSprite!.scale.x).toBeGreaterThan(0);
		renderer.dispose();
	});
});
