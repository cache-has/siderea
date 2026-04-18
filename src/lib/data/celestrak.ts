/**
 * CelesTrak TLE data client — fetch and cache satellite Two-Line Element sets.
 *
 * Fetches TLE data from CelesTrak's GP Data API (CORS-enabled, no key required).
 * Cached in IndexedDB with a 14-day TTL. Falls back to baked snapshot data
 * from static/data/tle-snapshot.json when offline or on error.
 *
 * Source: https://celestrak.org/NORAD/elements/gp.php
 */

import type { ApiCache } from './api-cache';
import { resilientFetch } from './resilient-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed TLE set with metadata. */
export interface TleData {
	name: string;
	line1: string;
	line2: string;
	/** Julian Date of the TLE epoch (parsed from line 1). */
	epochJd: number;
}

/** Baked TLE snapshot loaded from static JSON. */
export interface TleSnapshot {
	fetchedAt: string;
	tles: Record<string, { name: string; line1: string; line2: string }>;
}

/** Status of a TLE fetch operation (for UI binding). */
export type TleFetchStatus =
	| { state: 'idle' }
	| { state: 'loading' }
	| { state: 'success'; updated: number; fetchedAt: number }
	| { state: 'error'; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';

/** Cache TTL: 14 days (TLEs are valid for ~1-2 weeks). */
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** TLEs older than this are considered stale and should be refreshed. */
const STALENESS_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// TLE epoch parsing
// ---------------------------------------------------------------------------

/**
 * Parse TLE epoch from line 1 (columns 19-32: YYDDD.DDDDDDDD) into Julian Date.
 *
 * Year >= 57 → 1900+YY, else → 2000+YY (standard TLE convention).
 */
export function tleEpochToJD(line1: string): number {
	const epochStr = line1.substring(18, 32).trim();
	const year2 = parseInt(epochStr.substring(0, 2), 10);
	const dayOfYear = parseFloat(epochStr.substring(2));

	const year = year2 >= 57 ? 1900 + year2 : 2000 + year2;

	const a = Math.floor((14 - 1) / 12);
	const y = year + 4800 - a;
	const m = 1 + 12 * a - 3;
	const jdJan1 = 1 + Math.floor((153 * m + 2) / 5) + 365 * y +
		Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
	const jdJan0 = jdJan1 - 0.5 - 1;

	return jdJan0 + dayOfYear;
}

// ---------------------------------------------------------------------------
// 3LE text parser
// ---------------------------------------------------------------------------

/**
 * Parse CelesTrak 3LE text response into TLE records.
 * Format: name line + line 1 + line 2, repeated for each object.
 */
export function parse3LE(text: string): TleData[] {
	const lines = text.trim().split(/\r?\n/).map((l) => l.trimEnd());
	const results: TleData[] = [];

	for (let i = 0; i + 2 < lines.length; i += 3) {
		const name = lines[i].trim();
		const line1 = lines[i + 1];
		const line2 = lines[i + 2];

		if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;

		results.push({ name, line1, line2, epochJd: tleEpochToJD(line1) });
	}

	return results;
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

/**
 * Get the age of a TLE epoch in days relative to a Julian Date.
 * Positive = TLE is older than the reference date.
 */
export function tleAgeDays(epochJd: number, currentJd: number): number {
	return currentJd - epochJd;
}

/**
 * Whether a cached TLE entry should be refreshed (older than staleness threshold).
 * @param fetchedAt  Timestamp (ms since epoch) when the TLE was fetched from CelesTrak.
 */
export function isTleStale(fetchedAt: number): boolean {
	return Date.now() - fetchedAt > STALENESS_THRESHOLD_MS;
}

/**
 * Format TLE age as a human-readable string.
 */
export function formatTleAge(fetchedAt: number): string {
	const ageMs = Date.now() - fetchedAt;
	const hours = Math.floor(ageMs / (60 * 60 * 1000));
	if (hours < 1) return 'just now';
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return '1 day ago';
	return `${days} days ago`;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a single TLE by NORAD catalog ID from CelesTrak.
 * Returns parsed TLE data or throws on network/parse failure.
 */
export async function fetchTleFromCelesTrak(noradId: number): Promise<TleData> {
	const url = `${CELESTRAK_BASE}?CATNR=${noradId}&FORMAT=3LE`;
	const response = await resilientFetch(url);

	const text = await response.text();
	const tles = parse3LE(text);

	if (tles.length === 0) {
		throw new Error(`No valid TLE data returned for NORAD ${noradId}`);
	}

	return tles[0];
}

/**
 * Fetch TLEs for multiple NORAD IDs, with IndexedDB caching.
 *
 * Returns a map of NORAD ID → { data, fetchedAt, fromCache }.
 * Satellites that fail to fetch are silently omitted.
 */
export async function fetchTleBatch(
	noradIds: number[],
	cache?: ApiCache
): Promise<Map<number, { data: TleData; fetchedAt: number; fromCache: boolean }>> {
	const results = new Map<number, { data: TleData; fetchedAt: number; fromCache: boolean }>();

	for (const noradId of noradIds) {
		const cacheKey = `tle:${noradId}`;

		// Check cache first
		if (cache) {
			const hit = await cache.get<TleData>('tle', cacheKey);
			if (hit) {
				results.set(noradId, { data: hit.data, fetchedAt: hit.fetchedAt, fromCache: true });
				continue;
			}
		}

		try {
			const data = await fetchTleFromCelesTrak(noradId);
			const fetchedAt = Date.now();

			if (cache) {
				await cache.set('tle', cacheKey, data, CACHE_TTL_MS);
			}

			results.set(noradId, { data, fetchedAt, fromCache: false });
		} catch (err) {
			console.warn(`[celestrak] Failed to fetch TLE for NORAD ${noradId}:`, err);
			// Try stale cache as fallback
			if (cache) {
				const staleHit = await cache.getStale<TleData>('tle', cacheKey);
				if (staleHit) {
					results.set(noradId, { data: staleHit.data, fetchedAt: staleHit.fetchedAt, fromCache: true });
				}
			}
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Snapshot loader
// ---------------------------------------------------------------------------

/** Load the baked TLE snapshot from static data. */
export async function loadTleSnapshot(basePath = '/data'): Promise<Map<number, TleData>> {
	const response = await fetch(`${basePath}/tle-snapshot.json`);
	if (!response.ok) {
		console.warn('[celestrak] TLE snapshot not found, using empty set');
		return new Map();
	}

	const snapshot: TleSnapshot = await response.json();
	const result = new Map<number, TleData>();

	for (const [noradIdStr, entry] of Object.entries(snapshot.tles)) {
		const noradId = parseInt(noradIdStr, 10);
		result.set(noradId, {
			name: entry.name,
			line1: entry.line1,
			line2: entry.line2,
			epochJd: tleEpochToJD(entry.line1)
		});
	}

	return result;
}
