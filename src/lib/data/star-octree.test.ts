import { describe, it, expect } from 'vitest';
import { buildOctree, queryAABB, findNearest, getStarsForLOD } from './star-octree';
import type { StarCatalogData } from './types';

function makeMockCatalog(count: number): StarCatalogData {
	const positions = new Float32Array(count * 3);
	const apparentMag = new Float32Array(count);
	const absoluteMag = new Float32Array(count);
	const colorIndex = new Uint8Array(count);
	const pmRA = new Float32Array(count);
	const pmDec = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		// Spread stars in a 200pc cube centered on origin
		positions[i * 3] = (Math.random() - 0.5) * 200;
		positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
		positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
		apparentMag[i] = Math.random() * 15 - 1; // -1 to 14
		absoluteMag[i] = apparentMag[i] - 5;
		colorIndex[i] = Math.floor(Math.random() * 256);
	}

	// Place one known bright star at origin
	positions[0] = 0;
	positions[1] = 0;
	positions[2] = 0;
	apparentMag[0] = -1.5; // Very bright

	return { count, positions, apparentMag, absoluteMag, colorIndex, pmRA, pmDec };
}

describe('star-octree', () => {
	const catalog = makeMockCatalog(5000);
	const tree = buildOctree(catalog);

	it('builds without error', () => {
		expect(tree.root).toBeDefined();
		expect(tree.root.bounds.minX).toBeLessThan(tree.root.bounds.maxX);
	});

	it('queryAABB finds stars in range', () => {
		const results = queryAABB(tree, {
			minX: -10,
			minY: -10,
			minZ: -10,
			maxX: 10,
			maxY: 10,
			maxZ: 10
		});
		// Should find at least the star at origin
		expect(results.length).toBeGreaterThan(0);
		expect(results).toContain(0);
	});

	it('queryAABB returns empty for out-of-range box', () => {
		const results = queryAABB(tree, {
			minX: 500,
			minY: 500,
			minZ: 500,
			maxX: 600,
			maxY: 600,
			maxZ: 600
		});
		expect(results.length).toBe(0);
	});

	it('findNearest returns the closest star to origin', () => {
		const result = findNearest(tree, 0.01, 0.01, 0.01);
		expect(result).not.toBeNull();
		// Star 0 is at origin, should be the nearest
		expect(result![0]).toBe(0);
	});

	it('getStarsForLOD respects magnitude limit', () => {
		const bright = getStarsForLOD(tree, 2.0, 100);
		// All returned stars should have mag <= 2.0
		for (const idx of bright) {
			expect(catalog.apparentMag[idx]).toBeLessThanOrEqual(2.0);
		}
		// Star 0 (mag -1.5) should be included if maxCount allows
		const allBright = getStarsForLOD(tree, 2.0, 5000);
		expect(allBright).toContain(0);
	});
});
