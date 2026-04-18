/**
 * NASA Image and Video Library API client.
 *
 * Fetches hi-res images of celestial objects from NASA's public image library.
 * Used in info panels to show photographs of planets, nebulae, spacecraft, etc.
 *
 * API docs: https://images.nasa.gov/docs/images.nasa.gov%20API.pdf
 * No API key required. CORS enabled.
 */

import type { ApiCache } from './api-cache';
import { resilientFetch } from './resilient-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed result from a NASA Images search. */
export interface NasaImageResult {
	/** NASA's unique asset identifier. */
	nasaId: string;
	/** Image title. */
	title: string;
	/** Short description (may be empty). */
	description: string;
	/** Thumbnail URL (~300px). */
	thumbUrl: string;
	/** Original full-resolution image URL. */
	originalUrl: string;
	/** Credit / secondary creator. */
	credit: string;
	/** Date the image was created/published. */
	dateCreated: string;
}

/** Status of a NASA image fetch (for UI binding). */
export type NasaImageFetchStatus =
	| { state: 'idle' }
	| { state: 'loading' }
	| { state: 'success'; data: NasaImageResult; fromCache: boolean; fetchedAt: number; stale?: boolean }
	| { state: 'error'; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://images-api.nasa.gov';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

interface NasaSearchItem {
	href: string;
	data: Array<{
		nasa_id: string;
		title: string;
		description?: string;
		secondary_creator?: string;
		center?: string;
		date_created?: string;
		media_type: string;
	}>;
	links?: Array<{
		href: string;
		rel: string;
		render?: string;
	}>;
}

interface NasaSearchResponse {
	collection: {
		items: NasaSearchItem[];
		metadata: { total_hits: number };
	};
}

/** Extract the best image result from a NASA search response. */
function parseSearchResult(json: NasaSearchResponse): NasaImageResult | null {
	const items = json.collection?.items;
	if (!items || items.length === 0) return null;

	const item = items[0];
	const data = item.data?.[0];
	if (!data) return null;

	// Thumbnail from links array
	const thumbLink = item.links?.find((l) => l.rel === 'preview');
	const thumbUrl = thumbLink?.href ?? '';

	// Original URL follows NASA's asset naming convention
	const nasaId = data.nasa_id;
	const originalUrl = `https://images-assets.nasa.gov/image/${nasaId}/${nasaId}~orig.jpg`;

	const credit = data.secondary_creator || data.center || 'NASA';

	return {
		nasaId,
		title: data.title,
		description: data.description ?? '',
		thumbUrl,
		originalUrl,
		credit,
		dateCreated: data.date_created ?? '',
	};
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a representative NASA image for a celestial object.
 *
 * @param query       Search term (object name, e.g. "Jupiter", "Orion Nebula")
 * @param cache       Optional ApiCache for response caching
 * @returns           Parsed image result with cache metadata, or null if no results
 */
export async function fetchNasaImage(
	query: string,
	cache?: ApiCache
): Promise<{ data: NasaImageResult; fromCache: boolean; fetchedAt: number; stale?: boolean } | null> {
	const cacheKey = `nasa-img:${query.toLowerCase().trim()}`;

	// Check cache first
	if (cache) {
		const hit = await cache.get<NasaImageResult>('images', cacheKey);
		if (hit) return { data: hit.data, fromCache: true, fetchedAt: hit.fetchedAt };
	}

	const params = new URLSearchParams({
		q: query,
		media_type: 'image',
		page_size: '5',
	});

	const url = `${API_BASE}/search?${params.toString()}`;

	try {
		const response = await resilientFetch(url);

		const json: NasaSearchResponse = await response.json();
		const data = parseSearchResult(json);

		if (!data) return null;

		const fetchedAt = Date.now();

		// Cache the result
		if (cache) {
			await cache.set('images', cacheKey, data, CACHE_TTL_MS);
		}

		return { data, fromCache: false, fetchedAt };
	} catch (err) {
		// On failure, try serving stale cache data as fallback
		if (cache) {
			const staleHit = await cache.getStale<NasaImageResult>('images', cacheKey);
			if (staleHit) {
				return { data: staleHit.data, fromCache: true, fetchedAt: staleHit.fetchedAt, stale: true };
			}
		}
		throw err;
	}
}
