import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NotableObjectRegistry, NotableObject, NotableObjectType } from './types';
import { searchNotableObjects, getObjectsByType, findNearestObject } from './notable-objects';
import type { NotableObjectCatalog } from './notable-objects';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const jsonPath = resolve(testDir, '../../../static/data/notable-objects.json');

function loadTestRegistry(): NotableObjectRegistry | null {
	try {
		return JSON.parse(readFileSync(jsonPath, 'utf-8'));
	} catch {
		return null;
	}
}

/** Build an in-memory catalog for testing (mirrors loadNotableObjects without fetch). */
function buildTestCatalog(registry: NotableObjectRegistry): NotableObjectCatalog {
	const { objects } = registry;
	const nameIndex = new Map<string, NotableObject>();
	const catalogIndex = new Map<string, NotableObject>();
	const byType = new Map<NotableObjectType, NotableObject[]>();

	for (const obj of objects) {
		nameIndex.set(obj.name.toLowerCase(), obj);
		nameIndex.set(obj.id.toLowerCase(), obj);
		for (const catId of obj.catalog_ids) {
			catalogIndex.set(catId.toLowerCase(), obj);
		}
		const group = byType.get(obj.type);
		if (group) {
			group.push(obj);
		} else {
			byType.set(obj.type, [obj]);
		}
	}

	return { objects, nameIndex, catalogIndex, byType, count: objects.length };
}

const registry = loadTestRegistry();

describe('notable-objects registry', () => {
	it('loads and has valid structure', () => {
		if (!registry) return;
		expect(registry.format_version).toBe(1);
		expect(registry.coordinate_system).toBe('J2000 equatorial, parsecs');
		expect(registry.objects.length).toBeGreaterThan(50);
		expect(registry.total_objects).toBe(registry.objects.length);
	});

	it('every object has required base fields', () => {
		if (!registry) return;
		for (const obj of registry.objects) {
			expect(obj.id).toBeTruthy();
			expect(obj.name).toBeTruthy();
			expect(obj.type).toBeTruthy();
			expect(Array.isArray(obj.catalog_ids)).toBe(true);
			expect(typeof obj.ra).toBe('number');
			expect(typeof obj.dec).toBe('number');
			expect(typeof obj.dist_pc).toBe('number');
			expect(typeof obj.x).toBe('number');
			expect(typeof obj.y).toBe('number');
			expect(typeof obj.z).toBe('number');
			expect(typeof obj.description).toBe('string');
			expect(obj.description.length).toBeGreaterThan(10);
		}
	});

	it('has all expected object types', () => {
		if (!registry) return;
		const types = new Set(registry.objects.map((o) => o.type));
		expect(types.has('nebula')).toBe(true);
		expect(types.has('cluster')).toBe(true);
		expect(types.has('blackhole')).toBe(true);
		expect(types.has('pulsar')).toBe(true);
		expect(types.has('magnetar')).toBe(true);
		expect(types.has('variable_star')).toBe(true);
	});

	it('has unique IDs', () => {
		if (!registry) return;
		const ids = registry.objects.map((o) => o.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has Sgr A* as a supermassive black hole', () => {
		if (!registry) return;
		const sgr = registry.objects.find((o) => o.id === 'sgr_a_star');
		expect(sgr).toBeDefined();
		expect(sgr!.type).toBe('blackhole');
		if (sgr!.type === 'blackhole') {
			expect(sgr!.subtype).toBe('supermassive');
			expect(sgr!.mass_solar).toBeGreaterThan(3_000_000);
		}
	});

	it('has the Orion Nebula', () => {
		if (!registry) return;
		const orion = registry.objects.find((o) => o.name === 'Orion Nebula');
		expect(orion).toBeDefined();
		expect(orion!.type).toBe('nebula');
	});

	it('cartesian positions are consistent with RA/Dec/distance', () => {
		if (!registry) return;
		for (const obj of registry.objects) {
			const ra_rad = (obj.ra * Math.PI) / 180;
			const dec_rad = (obj.dec * Math.PI) / 180;
			const d = obj.dist_pc;

			const ex = d * Math.cos(dec_rad) * Math.cos(ra_rad);
			const ey = d * Math.cos(dec_rad) * Math.sin(ra_rad);
			const ez = d * Math.sin(dec_rad);

			// Allow 1 pc tolerance for rounding
			const tol = Math.max(1, d * 0.01);
			expect(Math.abs(obj.x - ex)).toBeLessThan(tol);
			expect(Math.abs(obj.y - ey)).toBeLessThan(tol);
			expect(Math.abs(obj.z - ez)).toBeLessThan(tol);
		}
	});
});

describe('notable-objects search', () => {
	it('searches by name', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const results = searchNotableObjects(catalog, 'orion');
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].name.toLowerCase()).toContain('orion');
	});

	it('searches by catalog ID', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const results = searchNotableObjects(catalog, 'M42');
		expect(results.length).toBeGreaterThan(0);
	});

	it('respects limit', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const results = searchNotableObjects(catalog, '', 5);
		expect(results.length).toBeLessThanOrEqual(5);
	});
});

describe('notable-objects type filtering', () => {
	it('filters by type', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const nebulae = getObjectsByType(catalog, 'nebula');
		expect(nebulae.length).toBeGreaterThan(20);
		expect(nebulae.every((n) => n.type === 'nebula')).toBe(true);
	});

	it('returns empty for unknown type', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const result = getObjectsByType(catalog, 'quasar' as NotableObjectType);
		expect(result).toEqual([]);
	});
});

describe('notable-objects nearest', () => {
	it('finds nearest object to origin', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const result = findNearestObject(catalog, 0, 0, 0);
		expect(result).not.toBeNull();
		expect(result!.distancePc).toBeGreaterThan(0);
	});
});
