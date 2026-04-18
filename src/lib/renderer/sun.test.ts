import { describe, it, expect } from 'vitest';
import { Scene, Mesh, Sprite } from 'three/webgpu';
import { SunRenderer, SUN_RADIUS_AU } from './sun';

describe('SunRenderer', () => {
	it('creates a mesh and corona sprite at the origin', () => {
		const sun = new SunRenderer();
		expect(sun.mesh).toBeInstanceOf(Mesh);
		expect(sun.corona).toBeInstanceOf(Sprite);
		expect(sun.mesh.position.x).toBe(0);
		expect(sun.mesh.position.y).toBe(0);
		expect(sun.mesh.position.z).toBe(0);
		expect(sun.corona.position.x).toBe(0);
		sun.dispose();
	});

	it('adds both mesh and corona to a scene', () => {
		const sun = new SunRenderer();
		const scene = new Scene();
		sun.addTo(scene);
		expect(scene.children).toContain(sun.mesh);
		expect(scene.children).toContain(sun.corona);
		sun.dispose();
	});

	it('removes both from a scene', () => {
		const sun = new SunRenderer();
		const scene = new Scene();
		sun.addTo(scene);
		sun.removeFrom(scene);
		expect(scene.children).not.toContain(sun.mesh);
		expect(scene.children).not.toContain(sun.corona);
		sun.dispose();
	});

	it('accepts custom visual radius', () => {
		const sun = new SunRenderer({ visualRadius: 0.05 });
		// Sphere geometry bounding sphere radius reflects the visual radius
		sun.mesh.geometry.computeBoundingSphere();
		const r = sun.mesh.geometry.boundingSphere!.radius;
		expect(r).toBeCloseTo(0.05, 4);
		sun.dispose();
	});

	it('accepts custom corona radius', () => {
		const sun = new SunRenderer({ coronaRadius: 0.3 });
		// Sprite scale = coronaRadius * 2
		expect(sun.corona.scale.x).toBeCloseTo(0.6, 4);
		expect(sun.corona.scale.y).toBeCloseTo(0.6, 4);
		sun.dispose();
	});

	it('exports a physically correct SUN_RADIUS_AU constant', () => {
		// IAU nominal: 695700 km, 1 AU = 149597870.7 km
		expect(SUN_RADIUS_AU).toBeCloseTo(0.00465047, 5);
	});
});
