/**
 * Wikipedia REST API client.
 *
 * Fetches article summaries for celestial objects from the English Wikipedia.
 * Used as supplemental text in info panels — provides a concise extract when
 * the baked description is absent or thin.
 *
 * API docs: https://en.wikipedia.org/api/rest_v1/
 * No API key required. CORS enabled.
 */

import type { ApiCache } from './api-cache';
import { resilientFetch, HttpError } from './resilient-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed result from a Wikipedia page summary. */
export interface WikipediaSummary {
	/** Article title. */
	title: string;
	/** Plain-text extract (first paragraph or two). */
	extract: string;
	/** Full article URL. */
	articleUrl: string;
	/** Thumbnail URL if available. */
	thumbnailUrl: string | null;
}

/** Status of a Wikipedia summary fetch (for UI binding). */
export type WikipediaFetchStatus =
	| { state: 'idle' }
	| { state: 'loading' }
	| { state: 'success'; data: WikipediaSummary; fromCache: boolean; fetchedAt: number; stale?: boolean }
	| { state: 'error'; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Maps object names to their Wikipedia article titles when they differ.
 * Only entries that need overriding belong here — most names work as-is.
 */
const TITLE_OVERRIDES: Record<string, string> = {
	'Sun': 'Sun',
	'Moon': 'Moon',
	'Sgr A*': 'Sagittarius_A*',
	'Sagittarius A*': 'Sagittarius_A*',
	'Alpha Centauri A': 'Alpha_Centauri',
	'Alpha Centauri B': 'Alpha_Centauri',
	'Proxima Centauri': 'Proxima_Centauri',
	'ISS': 'International_Space_Station',
	'Hubble': 'Hubble_Space_Telescope',
	'JWST': 'James_Webb_Space_Telescope',
	'Chandra': 'Chandra_X-ray_Observatory',
	'Voyager 1': 'Voyager_1',
	'Voyager 2': 'Voyager_2',
	'New Horizons': 'New_Horizons',
	'Pioneer 10': 'Pioneer_10',
	'Pioneer 11': 'Pioneer_11',
};

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

interface WikiSummaryResponse {
	title: string;
	extract: string;
	content_urls: {
		desktop: { page: string };
	};
	thumbnail?: {
		source: string;
		width: number;
		height: number;
	};
	type: string;
}

/** Parse the Wikipedia REST API summary response. */
export function parseSummaryResponse(json: WikiSummaryResponse): WikipediaSummary | null {
	// Wikipedia returns type: 'disambiguation' or 'no-extract' for non-article pages
	if (!json.extract || json.type === 'disambiguation' || json.type === 'no-extract') {
		return null;
	}

	return {
		title: json.title,
		extract: json.extract,
		articleUrl: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(json.title)}`,
		thumbnailUrl: json.thumbnail?.source ?? null,
	};
}

// ---------------------------------------------------------------------------
// Title resolution
// ---------------------------------------------------------------------------

/** Convert an object name to a Wikipedia article title. */
export function resolveWikiTitle(objectName: string): string {
	const override = TITLE_OVERRIDES[objectName];
	if (override) return override;

	// Replace spaces with underscores (Wikipedia URL convention)
	return objectName.replace(/\s+/g, '_');
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a Wikipedia summary for a celestial object.
 *
 * @param objectName  Display name of the object (e.g. "Jupiter", "Orion Nebula")
 * @param cache       Optional ApiCache for response caching
 * @returns           Parsed summary with cache metadata, or null if no article found
 */
export async function fetchWikipediaSummary(
	objectName: string,
	cache?: ApiCache
): Promise<{ data: WikipediaSummary; fromCache: boolean; fetchedAt: number; stale?: boolean } | null> {
	const wikiTitle = resolveWikiTitle(objectName);
	const cacheKey = `wiki:${wikiTitle.toLowerCase()}`;

	// Check cache first
	if (cache) {
		const hit = await cache.get<WikipediaSummary>('details', cacheKey);
		if (hit) return { data: hit.data, fromCache: true, fetchedAt: hit.fetchedAt };
	}

	const url = `${API_BASE}/${encodeURIComponent(wikiTitle)}`;

	try {
		const response = await resilientFetch(url, {
			headers: {
				// Wikipedia asks for a descriptive User-Agent
				'Api-User-Agent': 'Siderea/1.0 (https://github.com/siderea; universe explorer)',
			},
		});

		const json: WikiSummaryResponse = await response.json();
		const data = parseSummaryResponse(json);

		if (!data) return null;

		const fetchedAt = Date.now();

		// Cache the result
		if (cache) {
			await cache.set('details', cacheKey, data, CACHE_TTL_MS);
		}

		return { data, fromCache: false, fetchedAt };
	} catch (err) {
		// 404 from Wikipedia = no article, not an error
		if (err instanceof HttpError && err.status === 404) return null;

		// On failure, try serving stale cache data as fallback
		if (cache) {
			const staleHit = await cache.getStale<WikipediaSummary>('details', cacheKey);
			if (staleHit) {
				return { data: staleHit.data, fromCache: true, fetchedAt: staleHit.fetchedAt, stale: true };
			}
		}
		throw err;
	}
}
