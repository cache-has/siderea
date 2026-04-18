import { describe, it, expect } from 'vitest';
import { MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import { createPlanetMaterial, createEarthCloudMaterial } from './planet-materials';

describe('createPlanetMaterial', () => {
	it('returns a MeshStandardNodeMaterial for each planet NAIF ID', () => {
		for (const naifId of [1, 2, 3, 4, 5, 6, 7, 8]) {
			const result = createPlanetMaterial(naifId);
			expect(result).not.toBeNull();
			expect(result!.material).toBeInstanceOf(MeshStandardNodeMaterial);
			expect(result!.material.colorNode).toBeTruthy();
			result!.material.dispose();
		}
	});

	it('returns null for unknown NAIF IDs', () => {
		expect(createPlanetMaterial(0)).toBeNull();
		expect(createPlanetMaterial(99)).toBeNull();
	});

	it('sets appropriate roughness and metalness', () => {
		const result = createPlanetMaterial(3)!;
		expect(result.material.roughness).toBeCloseTo(0.85);
		expect(result.material.metalness).toBeCloseTo(0.05);
		result.material.dispose();
	});

	it('returns a sunDirUniform for Earth (NAIF 3) only', () => {
		const earth = createPlanetMaterial(3)!;
		expect(earth.sunDirUniform).not.toBeNull();
		expect(earth.sunDirUniform!.value).toBeInstanceOf(Vector3);
		earth.material.dispose();

		// Other planets should not have a sun direction uniform
		for (const naifId of [1, 2, 4, 5, 6, 7, 8]) {
			const result = createPlanetMaterial(naifId)!;
			expect(result.sunDirUniform).toBeNull();
			result.material.dispose();
		}
	});
});

describe('createEarthCloudMaterial', () => {
	it('creates a transparent material with sun direction uniform', () => {
		const sunDir = { value: new Vector3(1, 0, 0) };
		const mat = createEarthCloudMaterial(sunDir);
		expect(mat).toBeInstanceOf(MeshStandardNodeMaterial);
		expect(mat.transparent).toBe(true);
		expect(mat.depthWrite).toBe(false);
		expect(mat.opacityNode).toBeTruthy();
		mat.dispose();
	});
});
