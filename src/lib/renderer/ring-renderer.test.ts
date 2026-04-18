import { describe, it, expect } from 'vitest';
import { Mesh } from 'three/webgpu';
import { RingRenderer } from './ring-renderer';
import type { SolarSystemBody } from '$lib/data/types';

/** Minimal planet body for testing. */
function makeBody(overrides: Partial<SolarSystemBody> = {}): SolarSystemBody {
	return {
		id: 'saturn',
		name: 'Saturn',
		naif_id: 6,
		type: 'planet',
		parent_id: 'sun',
		mass_kg: 5.683e26,
		radius_km: 60268,
		radius_mean_km: 58232,
		axial_tilt_deg: 26.73,
		rotation_period_hours: 10.56,
		surface_gravity_m_s2: 10.44,
		orbital_period_days: 10759.22,
		atmosphere: null,
		rings: {
			inner_radius_km: 66900,
			outer_radius_km: 140220,
			description: 'Test ring system'
		},
		notable_features: [],
		description: '',
		texture_ref: null,
		...overrides
	};
}

describe('RingRenderer', () => {
	it('creates rings for bodies with ring data', () => {
		const bodies = [makeBody()];
		const renderer = new RingRenderer(bodies);
		const group = renderer.getGroup(6);
		expect(group).toBeDefined();
		expect(group!.children).toHaveLength(1);
		expect(group!.children[0]).toBeInstanceOf(Mesh);
		renderer.dispose();
	});

	it('skips bodies without ring data', () => {
		const bodies = [makeBody({ rings: null, naif_id: 3, id: 'earth' })];
		const renderer = new RingRenderer(bodies);
		expect(renderer.getGroup(3)).toBeUndefined();
		renderer.dispose();
	});

	it('skips bodies without a ring material factory', () => {
		// NAIF 1 (Mercury) has no ring material factory
		const bodies = [makeBody({ naif_id: 1, id: 'mercury' })];
		const renderer = new RingRenderer(bodies);
		expect(renderer.getGroup(1)).toBeUndefined();
		renderer.dispose();
	});

	it('attaches rings to parent meshes', () => {
		const bodies = [makeBody()];
		const renderer = new RingRenderer(bodies);
		const parentMesh = new Mesh();

		renderer.attachTo((naifId) => (naifId === 6 ? parentMesh : undefined));
		expect(parentMesh.children).toContain(renderer.getGroup(6));

		renderer.detach();
		expect(parentMesh.children).not.toContain(renderer.getGroup(6));
		renderer.dispose();
	});

	it('creates rings for Uranus and Neptune', () => {
		const bodies = [
			makeBody({
				naif_id: 7,
				id: 'uranus',
				rings: { inner_radius_km: 38000, outer_radius_km: 51149, description: 'Narrow rings' }
			}),
			makeBody({
				naif_id: 8,
				id: 'neptune',
				rings: { inner_radius_km: 41900, outer_radius_km: 62932, description: 'Faint rings' }
			})
		];
		const renderer = new RingRenderer(bodies);
		expect(renderer.getGroup(7)).toBeDefined();
		expect(renderer.getGroup(8)).toBeDefined();
		renderer.dispose();
	});

	it('update() does not throw when parent mesh is available', () => {
		const bodies = [makeBody()];
		const renderer = new RingRenderer(bodies);
		const parentMesh = new Mesh();
		parentMesh.position.set(5, 0, 0); // Saturn's position in AU

		renderer.attachTo((naifId) => (naifId === 6 ? parentMesh : undefined));

		// update() computes sun direction for shadow
		expect(() => {
			renderer.update((naifId) => (naifId === 6 ? parentMesh : undefined));
		}).not.toThrow();

		renderer.dispose();
	});

	it('update() gracefully handles missing parent mesh', () => {
		const bodies = [makeBody()];
		const renderer = new RingRenderer(bodies);

		expect(() => {
			renderer.update(() => undefined);
		}).not.toThrow();

		renderer.dispose();
	});
});
