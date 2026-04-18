import { describe, it, expect, vi } from 'vitest';
import { Scene, Mesh, MathUtils } from 'three/webgpu';
import { PlanetRenderer, dateToJD } from './planets';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';

/** Minimal planet body for testing. */
function makeBody(overrides: Partial<SolarSystemBody> = {}): SolarSystemBody {
	return {
		id: 'earth',
		name: 'Earth',
		naif_id: 3,
		type: 'planet',
		parent_id: 'sun',
		mass_kg: 5.9722e24,
		radius_km: 6378.1,
		radius_mean_km: 6371.0,
		axial_tilt_deg: 23.44,
		rotation_period_hours: 23.934,
		surface_gravity_m_s2: 9.807,
		orbital_period_days: 365.256,
		atmosphere: null,
		rings: null,
		notable_features: [],
		description: '',
		texture_ref: null,
		...overrides
	};
}

describe('dateToJD', () => {
	it('converts J2000 epoch correctly', () => {
		// J2000.0 = 2000-01-01T12:00:00 UTC = JD 2451545.0
		const j2000 = new Date('2000-01-01T12:00:00Z');
		expect(dateToJD(j2000)).toBeCloseTo(2451545.0, 4);
	});

	it('converts Unix epoch correctly', () => {
		// 1970-01-01T00:00:00 UTC = JD 2440587.5
		const unix = new Date('1970-01-01T00:00:00Z');
		expect(dateToJD(unix)).toBeCloseTo(2440587.5, 4);
	});
});

describe('PlanetRenderer', () => {
	it('creates meshes for provided planet bodies', () => {
		const bodies = [
			makeBody({ naif_id: 3, id: 'earth' }),
			makeBody({ naif_id: 4, id: 'mars', radius_km: 3396.2 })
		];
		const renderer = new PlanetRenderer(bodies);
		expect(renderer.meshes).toHaveLength(2);
		expect(renderer.getMesh(3)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(4)).toBeInstanceOf(Mesh);
		expect(renderer.getMesh(5)).toBeUndefined();
		renderer.dispose();
	});

	it('ignores non-planet NAIF IDs', () => {
		const bodies = [makeBody({ naif_id: 99 })];
		const renderer = new PlanetRenderer(bodies);
		expect(renderer.meshes).toHaveLength(0);
		renderer.dispose();
	});

	it('applies axial tilt to mesh rotation.z', () => {
		const bodies = [makeBody({ axial_tilt_deg: 23.44 })];
		const renderer = new PlanetRenderer(bodies);
		const mesh = renderer.getMesh(3)!;
		expect(mesh.rotation.z).toBeCloseTo(MathUtils.degToRad(23.44), 5);
		renderer.dispose();
	});

	it('sizes planets with exaggeration factor', () => {
		const bodies = [makeBody({ radius_km: 6378.1 })];
		const renderer = new PlanetRenderer(bodies, { sizeExaggeration: 200 });

		const mesh = renderer.getMesh(3)!;
		mesh.geometry.computeBoundingSphere();
		const r = mesh.geometry.boundingSphere!.radius;

		const expectedAU = (6378.1 / (METERS_PER_AU / 1000)) * 200;
		expect(r).toBeCloseTo(expectedAU, 8);
		renderer.dispose();
	});

	it('adds and removes meshes from a scene', () => {
		const bodies = [makeBody()];
		const renderer = new PlanetRenderer(bodies);
		const scene = new Scene();

		renderer.addTo(scene);
		expect(scene.children).toContain(renderer.getMesh(3));

		renderer.removeFrom(scene);
		expect(scene.children).not.toContain(renderer.getMesh(3));
		renderer.dispose();
	});

	it('updates positions from WASM ephemeris', () => {
		const bodies = [makeBody()];
		const mockPos = new Float64Array([METERS_PER_AU, 0, 0]);
		const wasm = { get_body_position: vi.fn().mockReturnValue(mockPos) };

		const renderer = new PlanetRenderer(bodies, { wasm });
		renderer.update(0.016, 2451545.0);

		expect(wasm.get_body_position).toHaveBeenCalledWith(3, 2451545.0);
		const mesh = renderer.getMesh(3)!;
		expect(mesh.position.x).toBeCloseTo(1.0, 5); // 1 AU
		expect(mesh.position.y).toBeCloseTo(0, 5);
		expect(mesh.position.z).toBeCloseTo(0, 5);
		renderer.dispose();
	});

	it('accumulates rotation over frames', () => {
		const bodies = [makeBody({ rotation_period_hours: 24 })];
		const renderer = new PlanetRenderer(bodies);

		const mesh = renderer.getMesh(3)!;
		const initialY = mesh.rotation.y;

		// Simulate 1 second at 24h period
		renderer.update(1.0, 2451545.0);
		const afterOneSecond = mesh.rotation.y;

		// Expected: 2π / (24 * 3600) ≈ 7.27e-5 rad/s
		const expectedRate = (2 * Math.PI) / (24 * 3600);
		expect(afterOneSecond - initialY).toBeCloseTo(expectedRate, 7);
		renderer.dispose();
	});

	it('setSizeExaggeration rebuilds geometry', () => {
		const bodies = [makeBody({ radius_km: 6378.1 })];
		const renderer = new PlanetRenderer(bodies, { sizeExaggeration: 100 });

		renderer.setSizeExaggeration(400);
		expect(renderer.exaggeration).toBe(400);

		const mesh = renderer.getMesh(3)!;
		mesh.geometry.computeBoundingSphere();
		const r = mesh.geometry.boundingSphere!.radius;
		const expectedAU = (6378.1 / (METERS_PER_AU / 1000)) * 400;
		expect(r).toBeCloseTo(expectedAU, 8);
		renderer.dispose();
	});

	it('creates cloud layer on Earth mesh', () => {
		const bodies = [makeBody()];
		const renderer = new PlanetRenderer(bodies, { earthClouds: true });
		const earthMesh = renderer.getMesh(3)!;
		// Cloud layer is a child of Earth mesh
		expect(earthMesh.children.length).toBeGreaterThan(0);
		renderer.dispose();
	});

	it('uses procedural materials by default', () => {
		const bodies = [makeBody()];
		const renderer = new PlanetRenderer(bodies);
		const mesh = renderer.getMesh(3)!;
		// Procedural material has colorNode set
		expect((mesh.material as { colorNode?: unknown }).colorNode).toBeTruthy();
		renderer.dispose();
	});

	it('uses flat color materials when proceduralMaterials is false', () => {
		const bodies = [makeBody()];
		const renderer = new PlanetRenderer(bodies, { proceduralMaterials: false, earthClouds: false });
		const mesh = renderer.getMesh(3)!;
		expect((mesh.material as { colorNode?: unknown }).colorNode).toBeUndefined();
		renderer.dispose();
	});

});
