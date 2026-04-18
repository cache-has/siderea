/**
 * Solar system object registry loader and query interface.
 *
 * Loads solar-system.json containing metadata for planets, moons, dwarf planets,
 * and man-made satellites. Positions are computed dynamically via the WASM
 * ephemeris engine; this module provides physical/descriptive metadata only.
 */

import type {
	SolarSystemBody,
	SolarSystemBodyType,
	Satellite,
	SatelliteSubtype,
	SolarSystemRegistry
} from './types';

/** Loaded and indexed solar system registry. */
export interface SolarSystemCatalog {
	/** All natural bodies (Sun, planets, moons, dwarf planets). */
	bodies: SolarSystemBody[];
	/** All man-made satellites/spacecraft. */
	satellites: Satellite[];
	/** Body lookup by ID. */
	bodyIndex: Map<string, SolarSystemBody>;
	/** Body lookup by NAIF ID (only bodies with naif_id >= 0). */
	naifIndex: Map<number, SolarSystemBody>;
	/** Bodies grouped by type. */
	bodiesByType: Map<SolarSystemBodyType, SolarSystemBody[]>;
	/** Bodies grouped by parent ID. */
	bodiesByParent: Map<string, SolarSystemBody[]>;
	/** Satellite lookup by ID. */
	satelliteIndex: Map<string, Satellite>;
	/** Satellites grouped by subtype. */
	satellitesBySubtype: Map<SatelliteSubtype, Satellite[]>;
}

/**
 * Build lookup indexes from bodies and satellites.
 */
function buildIndexes(
	bodies: SolarSystemBody[],
	satellites: Satellite[]
): Omit<SolarSystemCatalog, 'bodies' | 'satellites'> {
	const bodyIndex = new Map<string, SolarSystemBody>();
	const naifIndex = new Map<number, SolarSystemBody>();
	const bodiesByType = new Map<SolarSystemBodyType, SolarSystemBody[]>();
	const bodiesByParent = new Map<string, SolarSystemBody[]>();

	for (const body of bodies) {
		bodyIndex.set(body.id, body);
		if (body.naif_id >= 0) {
			naifIndex.set(body.naif_id, body);
		}

		const typeGroup = bodiesByType.get(body.type);
		if (typeGroup) {
			typeGroup.push(body);
		} else {
			bodiesByType.set(body.type, [body]);
		}

		if (body.parent_id) {
			const parentGroup = bodiesByParent.get(body.parent_id);
			if (parentGroup) {
				parentGroup.push(body);
			} else {
				bodiesByParent.set(body.parent_id, [body]);
			}
		}
	}

	const satelliteIndex = new Map<string, Satellite>();
	const satellitesBySubtype = new Map<SatelliteSubtype, Satellite[]>();

	for (const sat of satellites) {
		satelliteIndex.set(sat.id, sat);

		const subtypeGroup = satellitesBySubtype.get(sat.subtype);
		if (subtypeGroup) {
			subtypeGroup.push(sat);
		} else {
			satellitesBySubtype.set(sat.subtype, [sat]);
		}
	}

	return {
		bodyIndex,
		naifIndex,
		bodiesByType,
		bodiesByParent,
		satelliteIndex,
		satellitesBySubtype
	};
}

/**
 * Load the solar system registry from the static data directory.
 *
 * @param basePath Base URL path to the data directory (default: "/data")
 */
export async function loadSolarSystem(basePath = '/data'): Promise<SolarSystemCatalog> {
	const response = await fetch(`${basePath}/solar-system.json`);

	if (!response.ok) {
		throw new Error(
			`Failed to load solar-system.json: ${response.status} ${response.statusText}`
		);
	}

	const registry: SolarSystemRegistry = await response.json();
	const { bodies, satellites } = registry;
	const indexes = buildIndexes(bodies, satellites);

	return { bodies, satellites, ...indexes };
}

/**
 * Look up a body by its string ID.
 */
export function getBodyById(catalog: SolarSystemCatalog, id: string): SolarSystemBody | undefined {
	return catalog.bodyIndex.get(id);
}

/**
 * Look up a body by its NAIF ID (matching the Rust body registry).
 */
export function getBodyByNaifId(
	catalog: SolarSystemCatalog,
	naifId: number
): SolarSystemBody | undefined {
	return catalog.naifIndex.get(naifId);
}

/**
 * Get all bodies of a specific type.
 */
export function getBodiesByType(
	catalog: SolarSystemCatalog,
	type: SolarSystemBodyType
): SolarSystemBody[] {
	return catalog.bodiesByType.get(type) ?? [];
}

/**
 * Get all children (moons, etc.) of a given parent body.
 */
export function getChildren(
	catalog: SolarSystemCatalog,
	parentId: string
): SolarSystemBody[] {
	return catalog.bodiesByParent.get(parentId) ?? [];
}

/**
 * Look up a satellite by its string ID.
 */
export function getSatelliteById(
	catalog: SolarSystemCatalog,
	id: string
): Satellite | undefined {
	return catalog.satelliteIndex.get(id);
}

/**
 * Get all satellites of a specific subtype.
 */
export function getSatellitesBySubtype(
	catalog: SolarSystemCatalog,
	subtype: SatelliteSubtype
): Satellite[] {
	return catalog.satellitesBySubtype.get(subtype) ?? [];
}

/**
 * Search bodies and satellites by name prefix (case-insensitive).
 */
export function searchSolarSystem(
	catalog: SolarSystemCatalog,
	query: string,
	limit = 10
): Array<SolarSystemBody | Satellite> {
	const q = query.toLowerCase();
	const results: Array<SolarSystemBody | Satellite> = [];

	for (const body of catalog.bodies) {
		if (results.length >= limit) break;
		if (body.name.toLowerCase().includes(q) || body.id.toLowerCase().includes(q)) {
			results.push(body);
		}
	}

	for (const sat of catalog.satellites) {
		if (results.length >= limit) break;
		if (sat.name.toLowerCase().includes(q) || sat.id.toLowerCase().includes(q)) {
			results.push(sat);
		}
	}

	return results;
}
