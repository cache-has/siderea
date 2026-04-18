/**
 * Lightweight fuzzy search engine for Siderea.
 *
 * Scores results by relevance using a combination of:
 * - Exact prefix match (highest priority)
 * - Substring match
 * - Fuzzy character matching (handles typos/partial input)
 *
 * No external dependencies — this handles the ~200-300 searchable objects efficiently.
 */

import type { SearchResult } from './SearchPanel.svelte';

/** Score thresholds — results below MIN_SCORE are excluded. */
const MIN_SCORE = 0.2;

/**
 * Compute a fuzzy match score between a query and a target string.
 * Returns 0..1 where 1 is a perfect match.
 */
export function fuzzyScore(query: string, target: string): number {
	const q = query.toLowerCase();
	const t = target.toLowerCase();

	if (t === q) return 1.0;
	if (t.startsWith(q)) return 0.9 + 0.1 * (q.length / t.length);
	if (t.includes(q)) return 0.7 + 0.1 * (q.length / t.length);

	// Word-start bonus: check if query matches starts of words in target
	const words = t.split(/[\s\-_]+/);
	for (const word of words) {
		if (word.startsWith(q)) return 0.75;
	}

	// Fuzzy character matching: greedily match query chars in order through target
	let qi = 0;
	let consecutiveBonus = 0;
	let totalBonus = 0;
	let lastMatchIdx = -2;

	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) {
			// Bonus for consecutive matches
			if (ti === lastMatchIdx + 1) {
				consecutiveBonus++;
				totalBonus += consecutiveBonus * 0.05;
			} else {
				consecutiveBonus = 0;
			}
			// Bonus for matching at word boundaries
			if (ti === 0 || /[\s\-_]/.test(t[ti - 1])) {
				totalBonus += 0.1;
			}
			lastMatchIdx = ti;
			qi++;
		}
	}

	if (qi < q.length) return 0; // Not all query chars found

	const coverage = q.length / t.length;
	const baseScore = 0.3 + coverage * 0.3;
	return Math.min(baseScore + totalBonus, 0.69); // Cap below substring match
}

/**
 * Score a search result against a query, checking name plus optional extra fields.
 */
export function scoreResult(query: string, result: SearchResult, extraFields?: string[]): number {
	let best = fuzzyScore(query, result.name);

	if (extraFields) {
		for (const field of extraFields) {
			const score = fuzzyScore(query, field);
			if (score > best) best = score;
		}
	}

	return best;
}

/**
 * Sort and filter results by fuzzy relevance.
 */
export function rankResults(
	query: string,
	results: SearchResult[],
	limit: number,
	getExtraFields?: (result: SearchResult) => string[]
): SearchResult[] {
	const scored: Array<{ result: SearchResult; score: number }> = [];

	for (const result of results) {
		const extras = getExtraFields?.(result);
		const score = scoreResult(query, result, extras);
		if (score >= MIN_SCORE) {
			scored.push({ result, score });
		}
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map((s) => s.result);
}

// --- Recent Searches ---

const RECENT_SEARCHES_KEY = 'siderea-recent-searches';
const MAX_RECENT = 8;

export interface RecentSearch {
	name: string;
	kind: SearchResult['kind'];
	subtitle: string;
}

/** Load recent searches from localStorage. */
export function loadRecentSearches(): RecentSearch[] {
	try {
		const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.slice(0, MAX_RECENT);
	} catch {
		return [];
	}
}

/** Save a search selection to recent searches. */
export function saveRecentSearch(result: SearchResult): void {
	try {
		const recent = loadRecentSearches();
		const entry: RecentSearch = { name: result.name, kind: result.kind, subtitle: result.subtitle };
		// Remove duplicate if exists
		const filtered = recent.filter((r) => r.name !== entry.name);
		filtered.unshift(entry);
		localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
	} catch {
		// localStorage unavailable — silently ignore
	}
}

// --- Suggestions ---

/** Curated list of notable objects to suggest when search is empty. */
const SUGGESTION_NAMES: Array<{ name: string; kind: SearchResult['kind']; subtitle: string }> = [
	{ name: 'Earth', kind: 'body', subtitle: 'planet' },
	{ name: 'Mars', kind: 'body', subtitle: 'planet' },
	{ name: 'Jupiter', kind: 'body', subtitle: 'planet' },
	{ name: 'Saturn', kind: 'body', subtitle: 'planet' },
	{ name: 'Sirius', kind: 'star', subtitle: 'Star (A1V)' },
	{ name: 'Betelgeuse', kind: 'star', subtitle: 'Star (M1Ia)' },
	{ name: 'Polaris', kind: 'star', subtitle: 'Star (F7Ib)' },
	{ name: 'Orion Nebula', kind: 'nebula', subtitle: 'emission nebula' },
	{ name: 'Sagittarius A*', kind: 'blackhole', subtitle: 'supermassive black hole' },
	{ name: 'ISS (ZARYA)', kind: 'satellite', subtitle: 'space station' },
];

export function getSuggestions(): RecentSearch[] {
	return SUGGESTION_NAMES;
}
