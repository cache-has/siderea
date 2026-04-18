/**
 * NASA Exoplanet Archive TAP API client.
 *
 * Fetches confirmed exoplanet data for host stars from the NASA Exoplanet
 * Archive using ADQL queries against the Planetary Systems (ps) table.
 *
 * API docs: https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
 * No API key required. No CORS — requires proxy (Vite dev proxy or production proxy).
 */

import type { ApiCache } from './api-cache';
import type { Exoplanet, ExoplanetSystem } from './types';
import { getApiConfig } from './api-config';
import { resilientFetch } from './resilient-fetch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — exoplanet data changes rarely

/**
 * Map from Siderea notable star names to NASA Exoplanet Archive hostnames.
 *
 * The archive uses abbreviated/catalog names that don't always match the
 * common names in the HYG catalog. This map bridges the gap for stars
 * tagged as exoplanet_host in star-extended.json.
 */
const HOSTNAME_MAP: Record<string, string> = {
	'Proxima Centauri': 'Proxima Cen',
	'Fomalhaut': 'Fomalhaut',
	'Pollux': 'Pollux',
	'Ran': 'eps Eri',
	'Helvetios': '51 Peg',
	'Tau Ceti': 'tau Cet',
	'Ross 128': 'Ross 128',
	"Luyten's Star": 'GJ 273',
};

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

const COLUMNS = [
	'pl_name',
	'hostname',
	'pl_orbper',
	'pl_orbsmax',
	'pl_bmasse',
	'pl_rade',
	'discoverymethod',
	'disc_year',
	'pl_orbeccen',
	'pl_orbincl',
	'sy_pnum',
].join(',');

/** Build a TAP sync query URL for a given host star name. */
function buildQueryUrl(hostname: string): string {
	const baseUrl = getApiConfig().exoplanetProxyUrl;
	const query = `SELECT ${COLUMNS} FROM ps WHERE hostname='${hostname}' AND default_flag=1 ORDER BY pl_orbsmax`;
	const params = new URLSearchParams({ query, format: 'json' });
	return `${baseUrl}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

interface TapRow {
	pl_name: string;
	hostname: string;
	pl_orbper: number | null;
	pl_orbsmax: number | null;
	pl_bmasse: number | null;
	pl_rade: number | null;
	discoverymethod: string | null;
	disc_year: number | null;
	pl_orbeccen: number | null;
	pl_orbincl: number | null;
	sy_pnum: number | null;
}

function parseRow(row: TapRow): Exoplanet {
	return {
		name: row.pl_name,
		hostname: row.hostname,
		orbitalPeriodDays: row.pl_orbper,
		semiMajorAxisAU: row.pl_orbsmax,
		massEarth: row.pl_bmasse,
		radiusEarth: row.pl_rade,
		discoveryMethod: row.discoverymethod,
		discoveryYear: row.disc_year,
		eccentricity: row.pl_orbeccen,
		inclination: row.pl_orbincl,
	};
}

function parseResponse(rows: TapRow[]): ExoplanetSystem | null {
	if (rows.length === 0) return null;

	const planets = rows.map(parseRow);
	return {
		hostname: rows[0].hostname,
		planetCount: rows[0].sy_pnum ?? planets.length,
		planets,
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a Siderea star name to a NASA Exoplanet Archive hostname.
 * Returns the mapped hostname or the original name if no mapping exists.
 */
export function resolveHostname(starName: string): string {
	return HOSTNAME_MAP[starName] ?? starName;
}

/**
 * Fetch exoplanet data for a host star from the NASA Exoplanet Archive.
 *
 * @param starName  Star name as it appears in Siderea (e.g. "Proxima Centauri")
 * @param cache     Optional ApiCache for response caching
 * @returns         Parsed exoplanet system data with cache metadata, or null if no planets found
 */
export async function fetchExoplanets(
	starName: string,
	cache?: ApiCache
): Promise<{ data: ExoplanetSystem; fromCache: boolean; fetchedAt: number; stale?: boolean } | null> {
	const hostname = resolveHostname(starName);
	const cacheKey = `exoplanet:${hostname.toLowerCase()}`;

	// Check cache first
	if (cache) {
		const hit = await cache.get<ExoplanetSystem>('details', cacheKey);
		if (hit) return { data: hit.data, fromCache: true, fetchedAt: hit.fetchedAt };
	}

	const url = buildQueryUrl(hostname);

	try {
		const response = await resilientFetch(url);

		const json: TapRow[] = await response.json();
		const data = parseResponse(json);

		if (!data) return null;

		const fetchedAt = Date.now();

		// Cache the result
		if (cache) {
			await cache.set('details', cacheKey, data, CACHE_TTL_MS);
		}

		return { data, fromCache: false, fetchedAt };
	} catch (err) {
		// On failure, try serving stale cache data as fallback
		if (cache) {
			const staleHit = await cache.getStale<ExoplanetSystem>('details', cacheKey);
			if (staleHit) {
				return { data: staleHit.data, fromCache: true, fetchedAt: staleHit.fetchedAt, stale: true };
			}
		}
		throw err;
	}
}
