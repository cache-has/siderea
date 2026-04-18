import { describe, it, expect, vi } from 'vitest';
import { Scene, Mesh, Group } from 'three/webgpu';
import { MoonRenderer } from './moons';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';

function makeMoonBody(overrides: Partial<SolarSystemBody> = {}): SolarSystemBody {
	return {
		id: 'moon',
		name: 'Moon',
		naif_id: 301,
		type: 'moon',
		parent_id: 'earth',
		mass_kg: 7.342e22,
		radius_km: 1738.1,
		radius_mean_km: 1737.4,
		axial_tilt_deg: 6.687,
		rotation_period_hours: 655.73,
		surface_gravity_m_s2: 1.622,
		orbital_period_days: 27.322,
		atmosphere: null,
		rings: null,
		notable_features: [],
		description: '',
		texture_ref: null,
		...overrides
	};
}

describe('MoonRenderer', () => {
	it('creates meshes for moons with valid NAIF IDs', () => {
		const bodies = [
			makeMoonBody({ naif_id: 301, id: 'moon' }),
			makeMoonBody({ naif_id: 501, id: 'io', name: 'Io', radius_km: 1821.6 }),
			makeMoonBody({ naif_id: -1, id: 'unknown' }) // should be skipped
		];
		const renderer = new MoonRenderer(bodies);
		expect(renderer.moonIds).toEqual([301, 501]);
		expect(renderer.getMesh(301)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(501)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(-1)).toBeUndefined();
		renderer.dispose();
	});

	it('creates parent groups for each parent planet', () => {
		const bodies = [
			makeMoonBody({ naif_id: 301 }),
			makeMoonBody({ naif_id: 501, id: 'io', parent_id: 'jupiter' }),
			makeMoonBody({ naif_id: 502, id: 'europa', parent_id: 'jupiter' })
		];
		const renderer = new MoonRenderer(bodies);
		// Earth group (parent 3) and Jupiter group (parent 5)
		expect(renderer.getParentGroup(3)).toBeInstanceOf(Group);
		expect(renderer.getParentGroup(5)).toBeInstanceOf(Group);
		// Io and Europa share the same Jupiter group
		expect(renderer.getParentGroup(5)!.children).toHaveLength(2);
		renderer.dispose();
	});

	it('adds and removes groups from scene', () => {
		const bodies = [makeMoonBody()];
		const renderer = new MoonRenderer(bodies);
		const scene = new Scene();

		renderer.addTo(scene);
		expect(scene.children.length).toBeGreaterThan(0);

		renderer.removeFrom(scene);
		expect(scene.children).toHaveLength(0);
		renderer.dispose();
	});

	it('updates moon positions from WASM', () => {
		const bodies = [makeMoonBody()];
		const mockPos = new Float64Array([3.844e8, 0, 0]); // ~384,400 km in meters
		const wasm = { get_satellite_position: vi.fn().mockReturnValue(mockPos) };

		const renderer = new MoonRenderer(bodies, { wasm, sizeExaggeration: 200 });
		const parentMesh = new Mesh();
		parentMesh.position.set(1, 0, 0); // Earth at 1 AU

		renderer.update(2451545.0, (naifId) => naifId === 3 ? parentMesh : undefined);

		expect(wasm.get_satellite_position).toHaveBeenCalledWith(301, 2451545.0);

		// Parent group should follow parent mesh
		const group = renderer.getParentGroup(3)!;
		expect(group.position.x).toBeCloseTo(1.0, 5);

		// Moon mesh should be offset from parent by scaled distance
		const moonMesh = renderer.getMesh(301)!;
		const expectedScale = 200 * 0.5 / METERS_PER_AU;
		expect(moonMesh.position.x).toBeCloseTo(3.844e8 * expectedScale, 10);
		renderer.dispose();
	});

	it('setSizeExaggeration rebuilds moon geometry', () => {
		const bodies = [makeMoonBody({ radius_km: 1738.1 })];
		const renderer = new MoonRenderer(bodies, { sizeExaggeration: 100 });

		renderer.setSizeExaggeration(400);
		expect(renderer.exaggeration).toBe(400);

		const mesh = renderer.getMesh(301)!;
		mesh.geometry.computeBoundingSphere();
		const r = mesh.geometry.boundingSphere!.radius;
		const expectedAU = (1738.1 / (METERS_PER_AU / 1000)) * 400;
		expect(r).toBeCloseTo(expectedAU, 8);
		renderer.dispose();
	});

	it('disposes all resources cleanly', () => {
		const bodies = [
			makeMoonBody(),
			makeMoonBody({ naif_id: 501, id: 'io' })
		];
		const renderer = new MoonRenderer(bodies);
		renderer.dispose();
		expect(renderer.moonIds).toHaveLength(0);
	});
});
