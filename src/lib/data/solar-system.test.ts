import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SolarSystemRegistry, SolarSystemBody, Satellite } from './types';
import {
	getBodyById,
	getBodyByNaifId,
	getBodiesByType,
	getChildren,
	getSatelliteById,
	getSatellitesBySubtype,
	searchSolarSystem
} from './solar-system';
import type { SolarSystemCatalog } from './solar-system';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const jsonPath = resolve(testDir, '../../../static/data/solar-system.json');

function loadTestRegistry(): SolarSystemRegistry | null {
	try {
		return JSON.parse(readFileSync(jsonPath, 'utf-8'));
	} catch {
		return null;
	}
}

/** Build an in-memory catalog for testing (mirrors loadSolarSystem without fetch). */
function buildTestCatalog(registry: SolarSystemRegistry): SolarSystemCatalog {
	const { bodies, satellites } = registry;
	const bodyIndex = new Map<string, SolarSystemBody>();
	const naifIndex = new Map<number, SolarSystemBody>();
	const bodiesByType = new Map<string, SolarSystemBody[]>();
	const bodiesByParent = new Map<string, SolarSystemBody[]>();

	for (const body of bodies) {
		bodyIndex.set(body.id, body);
		if (body.naif_id >= 0) naifIndex.set(body.naif_id, body);

		const tg = bodiesByType.get(body.type);
		if (tg) tg.push(body);
		else bodiesByType.set(body.type, [body]);

		if (body.parent_id) {
			const pg = bodiesByParent.get(body.parent_id);
			if (pg) pg.push(body);
			else bodiesByParent.set(body.parent_id, [body]);
		}
	}

	const satelliteIndex = new Map<string, Satellite>();
	const satellitesBySubtype = new Map<string, Satellite[]>();

	for (const sat of satellites) {
		satelliteIndex.set(sat.id, sat);
		const sg = satellitesBySubtype.get(sat.subtype);
		if (sg) sg.push(sat);
		else satellitesBySubtype.set(sat.subtype, [sat]);
	}

	return {
		bodies,
		satellites,
		bodyIndex,
		naifIndex,
		bodiesByType,
		bodiesByParent,
		satelliteIndex,
		satellitesBySubtype
	} as SolarSystemCatalog;
}

const registry = loadTestRegistry();

describe('solar-system registry structure', () => {
	it('loads and has valid format', () => {
		if (!registry) return;
		expect(registry.format_version).toBe(1);
		expect(registry.bodies.length).toBeGreaterThan(20);
		expect(registry.satellites.length).toBeGreaterThan(10);
	});

	it('every body has required fields', () => {
		if (!registry) return;
		for (const body of registry.bodies) {
			expect(body.id).toBeTruthy();
			expect(body.name).toBeTruthy();
			expect(body.type).toBeTruthy();
			expect(typeof body.mass_kg).toBe('number');
			expect(body.mass_kg).toBeGreaterThan(0);
			expect(typeof body.radius_km).toBe('number');
			expect(body.radius_km).toBeGreaterThan(0);
			expect(typeof body.surface_gravity_m_s2).toBe('number');
			expect(typeof body.rotation_period_hours).toBe('number');
			expect(typeof body.description).toBe('string');
			expect(body.description.length).toBeGreaterThan(20);
		}
	});

	it('every satellite has required fields', () => {
		if (!registry) return;
		for (const sat of registry.satellites) {
			expect(sat.id).toBeTruthy();
			expect(sat.name).toBeTruthy();
			expect(sat.subtype).toBeTruthy();
			expect(sat.orbit_type).toBeTruthy();
			expect(sat.parent_id).toBeTruthy();
			expect(typeof sat.launch_date).toBe('string');
			expect(typeof sat.description).toBe('string');
			expect(sat.stats).toBeDefined();
		}
	});

	it('has unique body IDs', () => {
		if (!registry) return;
		const ids = registry.bodies.map((b) => b.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has unique satellite IDs', () => {
		if (!registry) return;
		const ids = registry.satellites.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has all expected body types', () => {
		if (!registry) return;
		const types = new Set(registry.bodies.map((b) => b.type));
		expect(types.has('star')).toBe(true);
		expect(types.has('planet')).toBe(true);
		expect(types.has('dwarf_planet')).toBe(true);
		expect(types.has('moon')).toBe(true);
	});

	it('has 8 planets', () => {
		if (!registry) return;
		const planets = registry.bodies.filter((b) => b.type === 'planet');
		expect(planets.length).toBe(8);
	});

	it('parent_id references exist as body IDs', () => {
		if (!registry) return;
		const bodyIds = new Set(registry.bodies.map((b) => b.id));
		for (const body of registry.bodies) {
			if (body.parent_id) {
				expect(bodyIds.has(body.parent_id)).toBe(true);
			}
		}
	});

	it('Sun has no parent', () => {
		if (!registry) return;
		const sun = registry.bodies.find((b) => b.id === 'sun');
		expect(sun).toBeDefined();
		expect(sun!.parent_id).toBeNull();
	});

	it('gas giants have atmosphere with null surface pressure', () => {
		if (!registry) return;
		for (const id of ['jupiter', 'saturn', 'uranus', 'neptune']) {
			const body = registry.bodies.find((b) => b.id === id);
			expect(body?.atmosphere).not.toBeNull();
			expect(body?.atmosphere?.surface_pressure_atm).toBeNull();
		}
	});

	it('heliocentric probes have state vectors', () => {
		if (!registry) return;
		const probes = registry.satellites.filter((s) => s.orbit_type === 'heliocentric');
		expect(probes.length).toBeGreaterThan(0);
		for (const probe of probes) {
			expect(probe.heliocentric_state).not.toBeNull();
			expect(typeof probe.heliocentric_state!.epoch).toBe('string');
			expect(typeof probe.heliocentric_state!.x_au).toBe('number');
		}
	});

	it('surface markers have coordinates', () => {
		if (!registry) return;
		const markers = registry.satellites.filter((s) => s.orbit_type === 'surface_marker');
		expect(markers.length).toBeGreaterThan(0);
		for (const marker of markers) {
			expect(marker.surface_marker).not.toBeNull();
			expect(typeof marker.surface_marker!.lat_deg).toBe('number');
			expect(typeof marker.surface_marker!.lon_deg).toBe('number');
		}
	});
});

describe('solar-system queries', () => {
	it('looks up body by ID', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const earth = getBodyById(catalog, 'earth');
		expect(earth).toBeDefined();
		expect(earth!.name).toBe('Earth');
		expect(earth!.type).toBe('planet');
	});

	it('looks up body by NAIF ID', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const mars = getBodyByNaifId(catalog, 4);
		expect(mars).toBeDefined();
		expect(mars!.id).toBe('mars');
	});

	it('gets bodies by type', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const moons = getBodiesByType(catalog, 'moon');
		expect(moons.length).toBeGreaterThan(5);
		expect(moons.every((m) => m.type === 'moon')).toBe(true);
	});

	it('gets children of a parent', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const jupiterMoons = getChildren(catalog, 'jupiter');
		expect(jupiterMoons.length).toBe(4);
		expect(jupiterMoons.map((m) => m.id).sort()).toEqual(
			['callisto', 'europa', 'ganymede', 'io']
		);
	});

	it('looks up satellite by ID', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const iss = getSatelliteById(catalog, 'iss');
		expect(iss).toBeDefined();
		expect(iss!.norad_id).toBe(25544);
	});

	it('gets satellites by subtype', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const probes = getSatellitesBySubtype(catalog, 'probe');
		expect(probes.length).toBeGreaterThan(3);
		expect(probes.every((p) => p.subtype === 'probe')).toBe(true);
	});

	it('searches by name', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const results = searchSolarSystem(catalog, 'jupiter');
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].name).toBe('Jupiter');
	});

	it('search includes satellites', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const results = searchSolarSystem(catalog, 'voyager');
		expect(results.length).toBe(2);
	});

	it('search respects limit', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const results = searchSolarSystem(catalog, '', 3);
		expect(results.length).toBeLessThanOrEqual(3);
	});

	it('returns comets', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		const comets = getBodiesByType(catalog, 'comet');
		expect(comets.length).toBe(6);
		expect(comets.map((c) => c.id)).toContain('halley');
	});

	it('returns empty for unknown type', () => {
		if (!registry) return;
		const catalog = buildTestCatalog(registry);
		expect(getBodiesByType(catalog, 'nonexistent_type' as never)).toEqual([]);
	});
});
