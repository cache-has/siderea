/**
 * JPL Horizons API client for fetching ephemeris data.
 *
 * Fetches state vectors (position + velocity) for solar system bodies from
 * the JPL Horizons system. Used for supplemental / validation data — primary
 * positioning is handled by the VSOP87 WASM engine.
 *
 * API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
 */

import type { ApiCache } from './api-cache';
import { getApiConfig } from './api-config';
import { resilientFetch } from './resilient-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed position/velocity state vector from Horizons. */
export interface HorizonsStateVector {
	/** Julian Day Number (TDB). */
	jdTdb: number;
	/** Calendar date string (e.g. "A.D. 2024-Jan-01 00:00:00.0000"). */
	epoch: string;
	/** Position in AU (ecliptic J2000, heliocentric). */
	position: { x: number; y: number; z: number };
	/** Velocity in AU/day (ecliptic J2000). */
	velocity: { vx: number; vy: number; vz: number };
}

/** Full parsed response from a Horizons ephemeris query. */
export interface HorizonsEphemeris {
	/** Target body name as returned by Horizons. */
	targetName: string;
	/** Center body name. */
	centerName: string;
	/** Parsed state vectors. */
	vectors: HorizonsStateVector[];
}

/** Status of a Horizons fetch operation (for UI binding). */
export type HorizonsFetchStatus =
	| { state: 'idle' }
	| { state: 'loading' }
	| { state: 'success'; data: HorizonsEphemeris; fromCache: boolean; fetchedAt: number; stale?: boolean }
	| { state: 'error'; message: string };

// ---------------------------------------------------------------------------
// NAIF ID mapping — internal registry IDs → JPL Horizons COMMAND strings
// ---------------------------------------------------------------------------

/**
 * The naif_id values in solar-system.json are WASM registry IDs, not standard
 * JPL NAIF IDs. This map handles the translation.
 *
 * Planets 1-8 → body centers (x99). Moons (3xx, 4xx, etc.) match directly.
 * Dwarf planets, comets, asteroids, and KBOs use explicit lookup tables.
 */
const NAIF_OVERRIDES: Record<number, string> = {
	// Sun
	0: '10',
	// Planets → body centers
	1: '199',   // Mercury
	2: '299',   // Venus
	3: '399',   // Earth
	4: '499',   // Mars
	5: '599',   // Jupiter
	6: '699',   // Saturn
	7: '799',   // Uranus
	8: '899',   // Neptune
	// Pluto
	9: '999',
	// Dwarf planets
	10: '2000001',  // Ceres
	11: '136199',   // Eris
	12: '136108',   // Haumea
	13: '136472',   // Makemake
	// Comets (internal 1001+)
	1001: 'DES=1P',        // 1P/Halley
	1002: 'DES=C/1995 O1', // Hale-Bopp
	1003: 'DES=C/2020 F3', // NEOWISE
	1004: 'DES=2P',        // 2P/Encke
	1005: 'DES=55P',       // 55P/Tempel-Tuttle
	1006: 'DES=109P',      // 109P/Swift-Tuttle
	// Asteroids (internal 2001+)
	2001: '2000004',  // 4 Vesta
	2002: '2000002',  // 2 Pallas
	2003: '2000010',  // 10 Hygiea
	// KBOs (internal 3001+)
	3001: '50000',   // Quaoar
	3002: '90377',   // Sedna
	3003: '90482',   // Orcus
};

/** Convert an internal naif_id to a JPL Horizons COMMAND string. Returns null if unmapped. */
export function naifIdToHorizonsCommand(naifId: number): string | null {
	const override = NAIF_OVERRIDES[naifId];
	if (override !== undefined) return override;

	// Moons use standard NAIF codes that match directly (301, 401, 501, etc.)
	if (naifId >= 100 && naifId < 1000) return String(naifId);

	return null;
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/** Build the query string for a Horizons API request. */
export function buildHorizonsUrl(
	naifId: number,
	startTime: string,
	stopTime: string,
	baseUrl?: string
): string {
	const command = naifIdToHorizonsCommand(naifId);
	if (!command) throw new Error(`No Horizons mapping for naif_id ${naifId}`);

	const params = new URLSearchParams({
		format: 'json',
		COMMAND: `'${command}'`,
		OBJ_DATA: 'YES',
		MAKE_EPHEM: 'YES',
		EPHEM_TYPE: 'VECTORS',
		CENTER: "'500@10'", // Sun body center
		REF_SYSTEM: 'ICRF',
		REF_PLANE: 'ECLIPTIC',
		VEC_TABLE: '2',     // Position + velocity only
		START_TIME: `'${startTime}'`,
		STOP_TIME: `'${stopTime}'`,
		STEP_SIZE: "'1'",
		VEC_LABELS: 'YES',
		CSV_FORMAT: 'NO',
	});

	const url = baseUrl ?? getApiConfig().horizonsProxyUrl;
	return `${url}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/** Extract the text block between $$SOE and $$EOE markers. */
function extractEphemerisBlock(resultText: string): string | null {
	const soeIdx = resultText.indexOf('$$SOE');
	const eoeIdx = resultText.indexOf('$$EOE');
	if (soeIdx === -1 || eoeIdx === -1 || eoeIdx <= soeIdx) return null;
	return resultText.substring(soeIdx + 5, eoeIdx).trim();
}

/** Extract target body name from the result header. */
function extractTargetName(resultText: string): string {
	const match = resultText.match(/Target body name:\s*(.+?)(?:\s*\{|\s*\()/);
	return match?.[1]?.trim() ?? 'Unknown';
}

/** Extract center name from the result header. */
function extractCenterName(resultText: string): string {
	const match = resultText.match(/Center body name:\s*(.+?)(?:\s*\{|\s*\()/);
	return match?.[1]?.trim() ?? 'Sun';
}

/**
 * Parse the text between $$SOE and $$EOE into state vectors.
 *
 * Each record looks like:
 * ```
 * 2460310.500000000 = A.D. 2024-Jan-01 00:00:00.0000 TDB
 *  X = 1.234E+00 Y = 5.678E-01 Z = 9.012E-02
 *  VX= 1.111E-02 VY= 2.222E-03 VZ= 3.333E-04
 * ```
 */
export function parseHorizonsVectors(ephemerisBlock: string): HorizonsStateVector[] {
	if (!ephemerisBlock.trim()) return [];

	const vectors: HorizonsStateVector[] = [];
	const lines = ephemerisBlock.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

	let i = 0;
	while (i < lines.length) {
		// Line 1: JD = date string
		const jdMatch = lines[i].match(/^(\d+\.\d+)\s*=\s*(.+)$/);
		if (!jdMatch) { i++; continue; }

		const jdTdb = parseFloat(jdMatch[1]);
		const epoch = jdMatch[2].trim();

		// Line 2: X = ... Y = ... Z = ...
		if (i + 1 >= lines.length) break;
		const posMatch = lines[i + 1].match(
			/X\s*=\s*([^\s]+)\s+Y\s*=\s*([^\s]+)\s+Z\s*=\s*([^\s]+)/
		);
		if (!posMatch) { i++; continue; }

		// Line 3: VX= ... VY= ... VZ= ...
		if (i + 2 >= lines.length) break;
		const velMatch = lines[i + 2].match(
			/VX\s*=\s*([^\s]+)\s+VY\s*=\s*([^\s]+)\s+VZ\s*=\s*([^\s]+)/
		);
		if (!velMatch) { i++; continue; }

		vectors.push({
			jdTdb,
			epoch,
			position: {
				x: parseFloat(posMatch[1]),
				y: parseFloat(posMatch[2]),
				z: parseFloat(posMatch[3]),
			},
			velocity: {
				vx: parseFloat(velMatch[1]),
				vy: parseFloat(velMatch[2]),
				vz: parseFloat(velMatch[3]),
			},
		});

		i += 3;
	}

	return vectors;
}

/** Parse a full Horizons JSON result string into structured data. */
export function parseHorizonsResult(resultText: string): HorizonsEphemeris {
	const block = extractEphemerisBlock(resultText);
	if (!block) {
		throw new Error('No ephemeris data found (missing $$SOE/$$EOE markers)');
	}

	return {
		targetName: extractTargetName(resultText),
		centerName: extractCenterName(resultText),
		vectors: parseHorizonsVectors(block),
	};
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch ephemeris state vectors for a solar system body from JPL Horizons.
 *
 * @param naifId   Internal naif_id from solar-system.json
 * @param simDate  Simulation date as ISO 8601 string (e.g. "2024-01-01")
 * @param cache    Optional ApiCache for response caching
 * @returns        Parsed ephemeris data with cache metadata
 */
export async function fetchHorizonsEphemeris(
	naifId: number,
	simDate: string,
	cache?: ApiCache
): Promise<{ data: HorizonsEphemeris; fromCache: boolean; fetchedAt: number; stale?: boolean }> {
	// Normalize date to YYYY-MM-DD for cache key consistency
	const dateKey = simDate.slice(0, 10);
	const cacheKey = `horizons:${naifId}:${dateKey}`;

	// Check cache first
	if (cache) {
		const hit = await cache.get<HorizonsEphemeris>('ephemeris', cacheKey);
		if (hit) return { data: hit.data, fromCache: true, fetchedAt: hit.fetchedAt };
	}

	// Build stop time: 1 minute after start to get a single data point
	const startDate = new Date(simDate);
	if (isNaN(startDate.getTime())) throw new Error(`Invalid date: ${simDate}`);
	const stopDate = new Date(startDate.getTime() + 60_000);

	const formatDate = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ');
	const startTime = formatDate(startDate);
	const stopTime = formatDate(stopDate);

	const url = buildHorizonsUrl(naifId, startTime, stopTime);

	try {
		const response = await resilientFetch(url);

		const json: { result?: string; error?: string } = await response.json();

		if (json.error) throw new Error(`Horizons API error: ${json.error}`);
		if (!json.result) throw new Error('Horizons API returned no result');

		const data = parseHorizonsResult(json.result);
		const fetchedAt = Date.now();

		// Cache the result
		if (cache) {
			await cache.set('ephemeris', cacheKey, data, CACHE_TTL_MS);
		}

		return { data, fromCache: false, fetchedAt };
	} catch (err) {
		// On failure, try serving stale cache data as fallback
		if (cache) {
			const staleHit = await cache.getStale<HorizonsEphemeris>('ephemeris', cacheKey);
			if (staleHit) {
				return { data: staleHit.data, fromCache: true, fetchedAt: staleHit.fetchedAt, stale: true };
			}
		}
		throw err;
	}
}
