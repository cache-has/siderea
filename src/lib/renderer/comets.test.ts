import { describe, it, expect, vi } from 'vitest';
import { Scene, Mesh, Sprite } from 'three/webgpu';
import { CometRenderer } from './comets';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';

/** Minimal comet body for testing. */
function makeComet(overrides: Partial<SolarSystemBody> = {}): SolarSystemBody {
	return {
		id: 'halley',
		name: '1P/Halley',
		naif_id: 1001,
		type: 'comet',
		parent_id: 'sun',
		mass_kg: 2.2e14,
		radius_km: 5.5,
		radius_mean_km: 5.5,
		axial_tilt_deg: 0,
		rotation_period_hours: 52.0,
		surface_gravity_m_s2: 0.0001,
		orbital_period_days: 27574,
		atmosphere: null,
		rings: null,
		notable_features: [],
		description: '',
		texture_ref: null,
		...overrides
	};
}

const ALL_COMETS = [
	makeComet({ naif_id: 1001, id: 'halley', name: '1P/Halley' }),
	makeComet({ naif_id: 1002, id: 'hale_bopp', name: 'Hale-Bopp', radius_km: 30 }),
	makeComet({ naif_id: 1003, id: 'neowise', name: 'NEOWISE', radius_km: 2.5 }),
	makeComet({ naif_id: 1004, id: 'encke', name: '2P/Encke', radius_km: 2.4 }),
	makeComet({ naif_id: 1005, id: 'tempel_tuttle', name: '55P/Tempel-Tuttle', radius_km: 1.8 }),
	makeComet({ naif_id: 1006, id: 'swift_tuttle', name: '109P/Swift-Tuttle', radius_km: 13 })
];

describe('CometRenderer', () => {
	it('creates meshes for all 6 comets', () => {
		const renderer = new CometRenderer(ALL_COMETS);
		expect(renderer.meshes).toHaveLength(6);
		expect(renderer.naifIds).toEqual([1001, 1002, 1003, 1004, 1005, 1006]);
		renderer.dispose();
	});

	it('returns mesh by NAIF ID', () => {
		const renderer = new CometRenderer(ALL_COMETS);
		expect(renderer.getMesh(1001)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(1002)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(9999)).toBeUndefined();
		renderer.dispose();
	});

	it('ignores non-comet NAIF IDs', () => {
		const bodies = [makeComet({ naif_id: 3 })]; // planet ID
		const renderer = new CometRenderer(bodies);
		expect(renderer.meshes).toHaveLength(0);
		renderer.dispose();
	});

	it('adds and removes objects from a scene', () => {
		const bodies = [makeComet()];
		const renderer = new CometRenderer(bodies);
		const scene = new Scene();

		renderer.addTo(scene);
		// Each comet adds 3 objects: nucleus, coma, tail
		expect(scene.children.length).toBe(3);

		renderer.removeFrom(scene);
		expect(scene.children.length).toBe(0);
		renderer.dispose();
	});

	it('updates positions from WASM ephemeris', () => {
		const bodies = [makeComet()];
		// Halley at ~35 AU from Sun
		const mockPos = new Float64Array([METERS_PER_AU * 35.0, 0, 0]);
		const wasm = { get_body_position: vi.fn().mockReturnValue(mockPos) };

		const renderer = new CometRenderer(bodies, { wasm });
		renderer.update(0.016, 2451545.0);

		expect(wasm.get_body_position).toHaveBeenCalledWith(1001, 2451545.0);
		const mesh = renderer.getMesh(1001)!;
		expect(mesh.position.x).toBeCloseTo(35.0, 3);
		renderer.dispose();
	});

	it('dispose cleans up all objects', () => {
		const renderer = new CometRenderer(ALL_COMETS);
		const scene = new Scene();
		renderer.addTo(scene);
		// 6 comets × 3 objects each = 18
		expect(scene.children.length).toBe(18);

		renderer.dispose();
		expect(renderer.meshes).toHaveLength(0);
		expect(scene.children.length).toBe(0);
	});
});
