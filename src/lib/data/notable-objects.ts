/**
 * Notable object registry loader and query interface.
 *
 * Loads notable-objects.json containing nebulae, star clusters, black holes,
 * pulsars, magnetars, and variable stars with J2000 equatorial positions.
 */

import type { NotableObject, NotableObjectType, NotableObjectRegistry } from './types';

/** Loaded and indexed notable object registry. */
export interface NotableObjectCatalog {
	/** All objects in the registry. */
	objects: NotableObject[];
	/** Map from object name (lowercase) to object for search. */
	nameIndex: Map<string, NotableObject>;
	/** Map from catalog ID (lowercase) to object. */
	catalogIndex: Map<string, NotableObject>;
	/** Objects grouped by type. */
	byType: Map<NotableObjectType, NotableObject[]>;
	/** Total number of objects. */
	count: number;
}

/**
 * Build lookup indexes from the object list.
 */
function buildIndexes(objects: NotableObject[]): {
	nameIndex: Map<string, NotableObject>;
	catalogIndex: Map<string, NotableObject>;
	byType: Map<NotableObjectType, NotableObject[]>;
} {
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

	return { nameIndex, catalogIndex, byType };
}

/**
 * Load the notable object registry from the static data directory.
 *
 * @param basePath Base URL path to the data directory (default: "/data")
 */
export async function loadNotableObjects(basePath = '/data'): Promise<NotableObjectCatalog> {
	const response = await fetch(`${basePath}/notable-objects.json`);

	if (!response.ok) {
		throw new Error(
			`Failed to load notable-objects.json: ${response.status} ${response.statusText}`
		);
	}

	const registry: NotableObjectRegistry = await response.json();
	const { objects } = registry;
	const { nameIndex, catalogIndex, byType } = buildIndexes(objects);

	return { objects, nameIndex, catalogIndex, byType, count: objects.length };
}

/**
 * Search for notable objects by name prefix (case-insensitive).
 * Searches object names and catalog IDs.
 */
export function searchNotableObjects(
	catalog: NotableObjectCatalog,
	query: string,
	limit = 10
): NotableObject[] {
	const q = query.toLowerCase();
	const results: NotableObject[] = [];
	const seen = new Set<string>();

	for (const obj of catalog.objects) {
		if (results.length >= limit) break;
		if (seen.has(obj.id)) continue;

		const matches =
			obj.name.toLowerCase().includes(q) ||
			obj.id.toLowerCase().includes(q) ||
			obj.catalog_ids.some((id) => id.toLowerCase().includes(q));

		if (matches) {
			results.push(obj);
			seen.add(obj.id);
		}
	}

	return results;
}

/**
 * Get all objects of a specific type.
 */
export function getObjectsByType(
	catalog: NotableObjectCatalog,
	type: NotableObjectType
): NotableObject[] {
	return catalog.byType.get(type) ?? [];
}

/**
 * Find the nearest notable object to a given position (in parsecs).
 * Returns null if catalog is empty.
 */
export function findNearestObject(
	catalog: NotableObjectCatalog,
	px: number,
	py: number,
	pz: number
): { object: NotableObject; distancePc: number } | null {
	let nearest: NotableObject | null = null;
	let minDist2 = Infinity;

	for (const obj of catalog.objects) {
		const dx = obj.x - px;
		const dy = obj.y - py;
		const dz = obj.z - pz;
		const dist2 = dx * dx + dy * dy + dz * dz;

		if (dist2 < minDist2) {
			minDist2 = dist2;
			nearest = obj;
		}
	}

	if (!nearest) return null;
	return { object: nearest, distancePc: Math.sqrt(minDist2) };
}
