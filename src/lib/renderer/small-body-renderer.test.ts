import { describe, it, expect, vi } from 'vitest';
import { Scene, Mesh } from 'three/webgpu';
import { SmallBodyRenderer } from './small-body-renderer';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';

/** Minimal small body for testing. */
function makeBody(overrides: Partial<SolarSystemBody> = {}): SolarSystemBody {
	return {
		id: 'vesta',
		name: '4 Vesta',
		naif_id: 2001,
		type: 'asteroid',
		parent_id: 'sun',
		mass_kg: 2.59e20,
		radius_km: 286.3,
		radius_mean_km: 262.7,
		axial_tilt_deg: 29.0,
		rotation_period_hours: 5.342,
		surface_gravity_m_s2: 0.25,
		orbital_period_days: 1325.75,
		atmosphere: null,
		rings: null,
		notable_features: [],
		description: '',
		texture_ref: null,
		...overrides
	};
}

const ALL_BODIES = [
	makeBody({ naif_id: 2001, id: 'vesta', name: '4 Vesta' }),
	makeBody({ naif_id: 2002, id: 'pallas', name: '2 Pallas', radius_km: 275 }),
	makeBody({ naif_id: 2003, id: 'hygiea', name: '10 Hygiea', radius_km: 217 }),
	makeBody({ naif_id: 3001, id: 'quaoar', name: '50000 Quaoar', type: 'kbo', radius_km: 555 }),
	makeBody({ naif_id: 3002, id: 'sedna', name: '90377 Sedna', type: 'kbo', radius_km: 497 }),
	makeBody({ naif_id: 3003, id: 'orcus', name: '90482 Orcus', type: 'kbo', radius_km: 458 })
];

describe('SmallBodyRenderer', () => {
	it('creates meshes for all 6 small bodies', () => {
		const renderer = new SmallBodyRenderer(ALL_BODIES);
		expect(renderer.meshes).toHaveLength(6);
		expect(renderer.naifIds).toEqual([2001, 2002, 2003, 3001, 3002, 3003]);
		renderer.dispose();
	});

	it('returns mesh by NAIF ID', () => {
		const renderer = new SmallBodyRenderer(ALL_BODIES);
		expect(renderer.getMesh(2001)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(3001)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(9999)).toBeUndefined();
		renderer.dispose();
	});

	it('ignores bodies with non-matching NAIF IDs', () => {
		const bodies = [makeBody({ naif_id: 3 })]; // planet ID
		const renderer = new SmallBodyRenderer(bodies);
		expect(renderer.meshes).toHaveLength(0);
		renderer.dispose();
	});

	it('adds and removes from scene', () => {
		const renderer = new SmallBodyRenderer(ALL_BODIES);
		const scene = new Scene();

		renderer.addTo(scene);
		expect(scene.children.length).toBe(6);

		renderer.removeFrom(scene);
		expect(scene.children.length).toBe(0);
		renderer.dispose();
	});

	it('updates positions from WASM ephemeris', () => {
		const bodies = [makeBody()]; // Vesta
		const mockPos = new Float64Array([METERS_PER_AU * 2.36, 0, 0]);
		const wasm = { get_body_position: vi.fn().mockReturnValue(mockPos) };

		const renderer = new SmallBodyRenderer(bodies, { wasm });
		renderer.update(0.016, 2451545.0);

		expect(wasm.get_body_position).toHaveBeenCalledWith(2001, 2451545.0);
		const mesh = renderer.getMesh(2001)!;
		expect(mesh.position.x).toBeCloseTo(2.36, 3);
		renderer.dispose();
	});

	it('dispose cleans up all objects', () => {
		const renderer = new SmallBodyRenderer(ALL_BODIES);
		const scene = new Scene();
		renderer.addTo(scene);
		expect(scene.children.length).toBe(6);

		renderer.dispose();
		expect(renderer.meshes).toHaveLength(0);
		expect(scene.children.length).toBe(0);
	});
});
