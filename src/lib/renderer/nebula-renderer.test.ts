import { describe, it, expect } from 'vitest';
import { Scene } from 'three/webgpu';
import { NebulaRenderer, angularToPhysicalPc } from './nebula-renderer';
import type { NebulaNO } from '$lib/data/types';

const ORION: NebulaNO = {
	id: 'ngc_1976',
	name: 'Orion Nebula',
	catalog_ids: ['M42', 'NGC 1976'],
	type: 'nebula',
	subtype: 'emission',
	ra: 83.82,
	dec: -5.39,
	dist_pc: 412,
	x: 44.1,
	y: 407.8,
	z: -38.7,
	angular_size_arcmin: 85,
	description: 'Bright emission nebula in Orion.',
	texture_ref: null
};

const HORSEHEAD: NebulaNO = {
	id: 'barnard_33',
	name: 'Horsehead Nebula',
	catalog_ids: ['Barnard 33'],
	type: 'nebula',
	subtype: 'dark',
	ra: 85.24,
	dec: -2.46,
	dist_pc: 400,
	x: 42.0,
	y: 396.0,
	z: -17.2,
	angular_size_arcmin: 8,
	description: 'Iconic dark nebula silhouetted against IC 434.',
	texture_ref: null
};

const RING: NebulaNO = {
	id: 'ngc_6720',
	name: 'Ring Nebula',
	catalog_ids: ['M57', 'NGC 6720'],
	type: 'nebula',
	subtype: 'planetary',
	ra: 283.40,
	dec: 33.03,
	dist_pc: 790,
	x: -200.0,
	y: -650.0,
	z: 430.0,
	angular_size_arcmin: 1.5,
	description: 'Classic planetary nebula in Lyra.',
	texture_ref: null
};

describe('angularToPhysicalPc', () => {
	it('converts angular size to physical size in parsecs', () => {
		// Orion Nebula: 85 arcmin at 412 pc
		// 85 arcmin = 85 × π/10800 ≈ 0.02472 rad
		// size = 412 × 0.02472 ≈ 10.18 pc
		const size = angularToPhysicalPc(85, 412);
		expect(size).toBeCloseTo(10.18, 1);
	});

	it('returns 0 for zero angular size', () => {
		expect(angularToPhysicalPc(0, 1000)).toBe(0);
	});

	it('scales linearly with distance', () => {
		const s1 = angularToPhysicalPc(10, 100);
		const s2 = angularToPhysicalPc(10, 200);
		expect(s2).toBeCloseTo(s1 * 2, 6);
	});
});

describe('NebulaRenderer', () => {
	it('creates sprites for all nebulae', () => {
		const renderer = new NebulaRenderer([ORION, HORSEHEAD, RING]);
		expect(renderer.items).toHaveLength(3);
		expect(renderer.items[0].id).toBe('ngc_1976');
		renderer.dispose();
	});

	it('filters non-nebula objects', () => {
		const blackhole = { ...ORION, type: 'blackhole' as const, subtype: 'stellar' as const, mass_solar: 10 };
		const renderer = new NebulaRenderer([blackhole as any, HORSEHEAD]);
		expect(renderer.items).toHaveLength(1);
		expect(renderer.items[0].id).toBe('barnard_33');
		renderer.dispose();
	});

	it('adds sprites to a scene', () => {
		const renderer = new NebulaRenderer([ORION, HORSEHEAD]);
		const scene = new Scene();
		renderer.addTo(scene);
		expect(scene.children).toHaveLength(2);
		renderer.dispose();
	});

	it('removes sprites from a scene', () => {
		const renderer = new NebulaRenderer([ORION]);
		const scene = new Scene();
		renderer.addTo(scene);
		renderer.removeFrom(scene);
		expect(scene.children).toHaveLength(0);
		renderer.dispose();
	});

	it('positions sprites at catalog coordinates', () => {
		const renderer = new NebulaRenderer([ORION]);
		const sprite = renderer.getSprite('ngc_1976');
		expect(sprite).toBeDefined();
		expect(sprite!.position.x).toBeCloseTo(44.1, 1);
		expect(sprite!.position.y).toBeCloseTo(407.8, 1);
		expect(sprite!.position.z).toBeCloseTo(-38.7, 1);
		renderer.dispose();
	});

	it('enforces minimum visual size', () => {
		// Ring Nebula: 1.5 arcmin at 790 pc → physical ~0.34 pc, below minVisualRadius
		const renderer = new NebulaRenderer([RING], { minVisualRadius: 2.0 });
		const sprite = renderer.getSprite('ngc_6720');
		// Scale should be >= minVisualRadius * 2 = 4.0
		expect(sprite!.scale.x).toBeGreaterThanOrEqual(4.0);
		renderer.dispose();
	});

	it('handles empty input', () => {
		const renderer = new NebulaRenderer([]);
		expect(renderer.items).toHaveLength(0);
		renderer.dispose();
	});
});
