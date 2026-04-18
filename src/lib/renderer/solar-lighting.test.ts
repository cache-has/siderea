import { describe, it, expect } from 'vitest';
import { Scene, PointLight, AmbientLight } from 'three/webgpu';
import { SolarSystemLighting } from './solar-lighting';

describe('SolarSystemLighting', () => {
	it('creates a PointLight at the origin with inverse-square decay', () => {
		const lighting = new SolarSystemLighting();
		expect(lighting.sunLight).toBeInstanceOf(PointLight);
		expect(lighting.sunLight.position.x).toBe(0);
		expect(lighting.sunLight.position.y).toBe(0);
		expect(lighting.sunLight.position.z).toBe(0);
		expect(lighting.sunLight.decay).toBe(2);
		expect(lighting.sunLight.distance).toBe(0);
		lighting.dispose();
	});

	it('creates an AmbientLight with low intensity', () => {
		const lighting = new SolarSystemLighting();
		expect(lighting.ambientLight).toBeInstanceOf(AmbientLight);
		expect(lighting.ambientLight.intensity).toBeLessThan(0.1);
		lighting.dispose();
	});

	it('applies custom options', () => {
		const lighting = new SolarSystemLighting({
			sunIntensity: 5,
			sunColor: 0xff0000,
			ambientIntensity: 0.1,
			ambientColor: 0x0000ff
		});
		expect(lighting.sunLight.intensity).toBe(5);
		expect(lighting.sunLight.color.getHex()).toBe(0xff0000);
		expect(lighting.ambientLight.intensity).toBe(0.1);
		expect(lighting.ambientLight.color.getHex()).toBe(0x0000ff);
		lighting.dispose();
	});

	it('adds both lights to a scene', () => {
		const lighting = new SolarSystemLighting();
		const scene = new Scene();
		lighting.addTo(scene);
		expect(scene.children).toContain(lighting.sunLight);
		expect(scene.children).toContain(lighting.ambientLight);
		lighting.dispose();
	});

	it('removes both lights from a scene', () => {
		const lighting = new SolarSystemLighting();
		const scene = new Scene();
		lighting.addTo(scene);
		lighting.removeFrom(scene);
		expect(scene.children).not.toContain(lighting.sunLight);
		expect(scene.children).not.toContain(lighting.ambientLight);
		lighting.dispose();
	});

	it('exposes intensity setters', () => {
		const lighting = new SolarSystemLighting();
		lighting.sunIntensity = 10;
		expect(lighting.sunLight.intensity).toBe(10);
		lighting.ambientIntensity = 0.5;
		expect(lighting.ambientLight.intensity).toBe(0.5);
		lighting.dispose();
	});
});
