import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectPicker, type PickableBody } from './object-picker';
import { Vector3, Vector2, PerspectiveCamera, Scene, SphereGeometry, Mesh, MeshBasicMaterial } from 'three';
import type { SolarSystemBody } from '$lib/data/types';

// Stub requestAnimationFrame for Three.js
vi.stubGlobal('requestAnimationFrame', vi.fn());

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
		surface_gravity_m_s2: 9.81,
		orbital_period_days: 365.25,
		atmosphere: null,
		rings: null,
		notable_features: [],
		description: 'Our home planet.',
		texture_ref: null,
		...overrides
	};
}

function makeCanvas(): HTMLCanvasElement {
	const canvas = {
		getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => '' }),
		parentElement: { style: { position: '' }, appendChild: vi.fn() },
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		style: {},
		width: 800,
		height: 600
	} as unknown as HTMLCanvasElement;
	return canvas;
}

describe('ObjectPicker', () => {
	let picker: ObjectPicker;
	let nearCamera: PerspectiveCamera;
	let farCamera: PerspectiveCamera;
	let nearScene: Scene;

	beforeEach(() => {
		nearCamera = new PerspectiveCamera(75, 800 / 600, 0.1, 1000);
		nearCamera.position.set(0, 0, 5);
		nearCamera.lookAt(0, 0, 0);
		nearCamera.updateMatrixWorld();
		nearCamera.updateProjectionMatrix();

		farCamera = new PerspectiveCamera(75, 800 / 600, 0.01, 100000);
		farCamera.position.set(0, 0, 0.00002);
		farCamera.lookAt(0, 0, 0);
		farCamera.updateMatrixWorld();
		farCamera.updateProjectionMatrix();

		nearScene = new Scene();

		picker = new ObjectPicker({
			nearCamera,
			farCamera,
			nearScene,
			canvas: makeCanvas()
		});
	});

	it('should return null for empty scene', () => {
		const result = picker.pick(400, 300);
		expect(result).toBeNull();
	});

	it('should register and find a body via raycast', () => {
		const body = makeBody();
		const geo = new SphereGeometry(0.5, 8, 8);
		const mat = new MeshBasicMaterial();
		const mesh = new Mesh(geo, mat);
		mesh.position.set(0, 0, 0);
		nearScene.add(mesh);
		mesh.updateMatrixWorld(true);

		picker.registerBody(mesh, body, 0.5);

		// Pick at center of screen (should hit the sphere at origin)
		const result = picker.pick(400, 300);
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('body');
		if (result!.kind === 'body') {
			expect(result!.body.name).toBe('Earth');
			expect(result!.radiusAU).toBe(0.5);
		}

		geo.dispose();
		mat.dispose();
	});

	it('should return null when clicking away from objects', () => {
		const body = makeBody();
		const geo = new SphereGeometry(0.1, 8, 8);
		const mat = new MeshBasicMaterial();
		const mesh = new Mesh(geo, mat);
		mesh.position.set(10, 10, 0); // far off to the side
		nearScene.add(mesh);
		mesh.updateMatrixWorld(true);

		picker.registerBody(mesh, body, 0.1);

		// Pick at center — should miss
		const result = picker.pick(400, 300);
		expect(result).toBeNull();

		geo.dispose();
		mat.dispose();
	});

	it('should unregister bodies', () => {
		const body = makeBody();
		const geo = new SphereGeometry(0.5, 8, 8);
		const mat = new MeshBasicMaterial();
		const mesh = new Mesh(geo, mat);
		mesh.position.set(0, 0, 0);
		nearScene.add(mesh);
		mesh.updateMatrixWorld(true);

		picker.registerBody(mesh, body, 0.5);
		picker.unregisterBody(mesh);

		const result = picker.pick(400, 300);
		// Raycast still hits the mesh in the scene, but it's not registered
		// so the picker won't find a body match — depends on walk-up logic
		// The mesh is still in the scene, but not in the registry
		expect(result).toBeNull();

		geo.dispose();
		mat.dispose();
	});

	it('should dispose cleanly', () => {
		const body = makeBody();
		const geo = new SphereGeometry(0.5, 8, 8);
		const mat = new MeshBasicMaterial();
		const mesh = new Mesh(geo, mat);
		picker.registerBody(mesh, body, 0.5);

		picker.dispose();

		// After dispose, internal state is cleared
		const result = picker.pick(400, 300);
		expect(result).toBeNull();

		geo.dispose();
		mat.dispose();
	});
});
