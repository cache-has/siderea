import { describe, it, expect, vi } from 'vitest';
import { Scene, Mesh, MathUtils } from 'three/webgpu';
import { DwarfPlanetRenderer } from './dwarf-planets';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';

/** Minimal dwarf planet body for testing. */
function makeBody(overrides: Partial<SolarSystemBody> = {}): SolarSystemBody {
	return {
		id: 'pluto',
		name: 'Pluto',
		naif_id: 9,
		type: 'dwarf_planet',
		parent_id: 'sun',
		mass_kg: 1.303e22,
		radius_km: 1188.3,
		radius_mean_km: 1188.3,
		axial_tilt_deg: 122.53,
		rotation_period_hours: -153.29,
		surface_gravity_m_s2: 0.62,
		orbital_period_days: 90560,
		atmosphere: null,
		rings: null,
		notable_features: [],
		description: '',
		texture_ref: null,
		...overrides
	};
}

const ALL_DWARF_PLANETS = [
	makeBody({ naif_id: 9, id: 'pluto', name: 'Pluto' }),
	makeBody({ naif_id: 10, id: 'ceres', name: 'Ceres', radius_km: 476.2 }),
	makeBody({ naif_id: 11, id: 'eris', name: 'Eris', radius_km: 1163 }),
	makeBody({ naif_id: 12, id: 'haumea', name: 'Haumea', radius_km: 816 }),
	makeBody({ naif_id: 13, id: 'makemake', name: 'Makemake', radius_km: 715 })
];

describe('DwarfPlanetRenderer', () => {
	it('creates meshes for all 5 dwarf planets', () => {
		const renderer = new DwarfPlanetRenderer(ALL_DWARF_PLANETS);
		expect(renderer.meshes).toHaveLength(5);
		expect(renderer.naifIds).toEqual([9, 10, 11, 12, 13]);
		renderer.dispose();
	});

	it('returns mesh by NAIF ID', () => {
		const renderer = new DwarfPlanetRenderer(ALL_DWARF_PLANETS);
		expect(renderer.getMesh(9)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(10)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(99)).toBeUndefined();
		renderer.dispose();
	});

	it('ignores non-dwarf-planet NAIF IDs', () => {
		const bodies = [makeBody({ naif_id: 3 })]; // planet ID, not dwarf
		const renderer = new DwarfPlanetRenderer(bodies);
		expect(renderer.meshes).toHaveLength(0);
		renderer.dispose();
	});

	it('applies axial tilt to mesh rotation.z', () => {
		const bodies = [makeBody({ axial_tilt_deg: 122.53 })];
		const renderer = new DwarfPlanetRenderer(bodies);
		const mesh = renderer.getMesh(9)!;
		expect(mesh.rotation.z).toBeCloseTo(MathUtils.degToRad(122.53), 5);
		renderer.dispose();
	});

	it('handles retrograde rotation (negative period)', () => {
		const bodies = [makeBody({ rotation_period_hours: -153.29 })];
		const renderer = new DwarfPlanetRenderer(bodies);
		renderer.update(1.0, 2451545.0);
		const mesh = renderer.getMesh(9)!;
		// Retrograde: rotation should be negative
		expect(mesh.rotation.y).toBeLessThan(0);
		renderer.dispose();
	});

	it('sizes dwarf planets with exaggeration factor', () => {
		const bodies = [makeBody({ radius_km: 1188.3 })];
		const renderer = new DwarfPlanetRenderer(bodies, { sizeExaggeration: 200 });
		const mesh = renderer.getMesh(9)!;
		mesh.geometry.computeBoundingSphere();
		const r = mesh.geometry.boundingSphere!.radius;
		const expectedAU = (1188.3 / (METERS_PER_AU / 1000)) * 200;
		expect(r).toBeCloseTo(expectedAU, 8);
		renderer.dispose();
	});

	it('adds and removes meshes from a scene', () => {
		const bodies = [makeBody()];
		const renderer = new DwarfPlanetRenderer(bodies);
		const scene = new Scene();

		renderer.addTo(scene);
		expect(scene.children).toContain(renderer.getMesh(9));

		renderer.removeFrom(scene);
		expect(scene.children).not.toContain(renderer.getMesh(9));
		renderer.dispose();
	});

	it('updates positions from WASM ephemeris', () => {
		const bodies = [makeBody()];
		const mockPos = new Float64Array([METERS_PER_AU * 39.5, 0, 0]); // ~39.5 AU (Pluto)
		const wasm = { get_body_position: vi.fn().mockReturnValue(mockPos) };

		const renderer = new DwarfPlanetRenderer(bodies, { wasm });
		renderer.update(0.016, 2451545.0);

		expect(wasm.get_body_position).toHaveBeenCalledWith(9, 2451545.0);
		const mesh = renderer.getMesh(9)!;
		expect(mesh.position.x).toBeCloseTo(39.5, 3);
		renderer.dispose();
	});

	it('setSizeExaggeration rebuilds geometry', () => {
		const bodies = [makeBody({ radius_km: 1188.3 })];
		const renderer = new DwarfPlanetRenderer(bodies, { sizeExaggeration: 100 });

		renderer.setSizeExaggeration(400);
		expect(renderer.exaggeration).toBe(400);

		const mesh = renderer.getMesh(9)!;
		mesh.geometry.computeBoundingSphere();
		const r = mesh.geometry.boundingSphere!.radius;
		const expectedAU = (1188.3 / (METERS_PER_AU / 1000)) * 400;
		expect(r).toBeCloseTo(expectedAU, 8);
		renderer.dispose();
	});

	it('dispose cleans up all meshes', () => {
		const renderer = new DwarfPlanetRenderer(ALL_DWARF_PLANETS);
		const scene = new Scene();
		renderer.addTo(scene);
		expect(scene.children.length).toBe(5);

		renderer.dispose();
		expect(renderer.meshes).toHaveLength(0);
		expect(scene.children.length).toBe(0);
	});
});
