import { describe, it, expect } from 'vitest';
import { Mesh } from 'three/webgpu';
import { AtmosphereRenderer } from './atmosphere-renderer';
import type { SolarSystemBody } from '$lib/data/types';

function makeBody(overrides: Partial<SolarSystemBody> = {}): SolarSystemBody {
	return {
		id: 'earth',
		name: 'Earth',
		naif_id: 3,
		type: 'planet',
		parent_id: 'sun',
		mass_kg: 5.972e24,
		radius_km: 6371,
		radius_mean_km: 6371,
		axial_tilt_deg: 23.44,
		rotation_period_hours: 23.93,
		surface_gravity_m_s2: 9.807,
		orbital_period_days: 365.256,
		atmosphere: {
			surface_pressure_atm: 1.0,
			composition: { N2: 78.08, O2: 20.95 }
		},
		rings: null,
		notable_features: [],
		description: '',
		texture_ref: null,
		...overrides
	};
}

describe('AtmosphereRenderer', () => {
	it('creates atmosphere shells for planets with atmosphere data and known style', () => {
		const bodies = [makeBody()];
		const renderer = new AtmosphereRenderer(bodies);
		expect(renderer.naifIds).toContain(3);
		renderer.dispose();
	});

	it('skips planets without atmosphere data', () => {
		const bodies = [makeBody({ naif_id: 1, id: 'mercury', atmosphere: null })];
		const renderer = new AtmosphereRenderer(bodies);
		expect(renderer.naifIds).not.toContain(1);
		renderer.dispose();
	});

	it('skips planets with atmosphere but no known style', () => {
		// NAIF 99 has no style defined
		const bodies = [makeBody({ naif_id: 99 })];
		const renderer = new AtmosphereRenderer(bodies);
		expect(renderer.naifIds).toHaveLength(0);
		renderer.dispose();
	});

	it('creates atmospheres for all expected planets', () => {
		const bodies = [
			makeBody({ naif_id: 2, id: 'venus' }),
			makeBody({ naif_id: 3, id: 'earth' }),
			makeBody({ naif_id: 4, id: 'mars' }),
			makeBody({ naif_id: 5, id: 'jupiter', atmosphere: { surface_pressure_atm: null, composition: { H2: 89.8 } } }),
			makeBody({ naif_id: 6, id: 'saturn', atmosphere: { surface_pressure_atm: null, composition: { H2: 96.3 } } }),
			makeBody({ naif_id: 7, id: 'uranus', atmosphere: { surface_pressure_atm: null, composition: { H2: 82.5 } } }),
			makeBody({ naif_id: 8, id: 'neptune', atmosphere: { surface_pressure_atm: null, composition: { H2: 80 } } }),
			makeBody({ naif_id: 9, id: 'pluto', atmosphere: { surface_pressure_atm: 0.00001, composition: { N2: 97 } } })
		];
		const renderer = new AtmosphereRenderer(bodies);
		expect(renderer.naifIds).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
		renderer.dispose();
	});

	it('attaches atmosphere meshes to parent planet meshes', () => {
		const bodies = [makeBody()];
		const renderer = new AtmosphereRenderer(bodies);
		const parentMesh = new Mesh();

		renderer.attachTo((naifId) => (naifId === 3 ? parentMesh : undefined));
		expect(parentMesh.children.length).toBe(1);

		renderer.detach();
		expect(parentMesh.children.length).toBe(0);
		renderer.dispose();
	});

	it('updates size exaggeration without errors', () => {
		const bodies = [makeBody()];
		const renderer = new AtmosphereRenderer(bodies, { sizeExaggeration: 200 });
		expect(() => renderer.setSizeExaggeration(100)).not.toThrow();
		renderer.dispose();
	});

	it('disposes cleanly', () => {
		const bodies = [makeBody()];
		const renderer = new AtmosphereRenderer(bodies);
		expect(() => renderer.dispose()).not.toThrow();
		expect(renderer.naifIds).toHaveLength(0);
	});
});
