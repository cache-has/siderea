import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fuzzyScore, rankResults, loadRecentSearches, saveRecentSearch, getSuggestions } from './fuzzy-search';
import type { SearchResult } from './SearchPanel.svelte';

describe('fuzzyScore', () => {
	it('returns 1.0 for exact match', () => {
		expect(fuzzyScore('earth', 'Earth')).toBe(1.0);
	});

	it('scores prefix match higher than substring', () => {
		const prefix = fuzzyScore('ear', 'Earth');
		const substring = fuzzyScore('art', 'Earth');
		expect(prefix).toBeGreaterThan(substring);
	});

	it('scores substring match higher than fuzzy', () => {
		const substring = fuzzyScore('art', 'Earth');
		const fuzzy = fuzzyScore('erh', 'Earth');
		expect(substring).toBeGreaterThan(fuzzy);
	});

	it('returns 0 for no match', () => {
		expect(fuzzyScore('xyz', 'Earth')).toBe(0);
	});

	it('handles catalog IDs like M42, NGC 1976', () => {
		expect(fuzzyScore('M42', 'M42')).toBe(1.0);
		expect(fuzzyScore('ngc', 'NGC 1976')).toBeGreaterThan(0.7);
	});

	it('handles word-boundary matching', () => {
		const score = fuzzyScore('orion', 'Orion Nebula');
		expect(score).toBeGreaterThan(0.7);
	});

	it('handles partial fuzzy input with typos', () => {
		// "betlgse" missing some chars of "Betelgeuse"
		const score = fuzzyScore('betlgse', 'Betelgeuse');
		expect(score).toBeGreaterThan(0.2);
	});
});

describe('rankResults', () => {
	const makeResult = (name: string, kind: SearchResult['kind'] = 'star'): SearchResult => ({
		name,
		kind,
		subtitle: 'test',
		data: {} as SearchResult['data']
	});

	it('ranks exact matches first', () => {
		const results = [makeResult('Mars'), makeResult('Earth'), makeResult('Marshmallow')];
		const ranked = rankResults('mars', results, 10);
		expect(ranked[0].name).toBe('Mars');
	});

	it('respects limit', () => {
		const results = Array.from({ length: 20 }, (_, i) => makeResult(`Star ${i}`));
		const ranked = rankResults('star', results, 5);
		expect(ranked.length).toBe(5);
	});

	it('filters out low-scoring results', () => {
		const results = [makeResult('Earth'), makeResult('Jupiter')];
		const ranked = rankResults('xyz', results, 10);
		expect(ranked.length).toBe(0);
	});

	it('uses extra fields for matching', () => {
		const results = [makeResult('Orion Nebula')];
		const ranked = rankResults('M42', results, 10, () => ['M42', 'NGC 1976']);
		expect(ranked.length).toBe(1);
	});
});

describe('recent searches', () => {
	const store: Record<string, string> = {};

	beforeEach(() => {
		for (const key of Object.keys(store)) delete store[key];
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store[key] ?? null,
			setItem: (key: string, value: string) => { store[key] = value; },
			removeItem: (key: string) => { delete store[key]; },
		});
	});

	const makeResult = (name: string): SearchResult => ({
		name,
		kind: 'star',
		subtitle: 'test',
		data: {} as SearchResult['data']
	});

	it('starts empty', () => {
		expect(loadRecentSearches()).toEqual([]);
	});

	it('saves and loads a recent search', () => {
		saveRecentSearch(makeResult('Sirius'));
		const recent = loadRecentSearches();
		expect(recent.length).toBe(1);
		expect(recent[0].name).toBe('Sirius');
	});

	it('puts newest first', () => {
		saveRecentSearch(makeResult('Sirius'));
		saveRecentSearch(makeResult('Polaris'));
		const recent = loadRecentSearches();
		expect(recent[0].name).toBe('Polaris');
		expect(recent[1].name).toBe('Sirius');
	});

	it('deduplicates on re-select', () => {
		saveRecentSearch(makeResult('Sirius'));
		saveRecentSearch(makeResult('Polaris'));
		saveRecentSearch(makeResult('Sirius'));
		const recent = loadRecentSearches();
		expect(recent.length).toBe(2);
		expect(recent[0].name).toBe('Sirius');
	});

	it('limits to 8 entries', () => {
		for (let i = 0; i < 12; i++) {
			saveRecentSearch(makeResult(`Star ${i}`));
		}
		expect(loadRecentSearches().length).toBe(8);
	});
});

describe('getSuggestions', () => {
	it('returns a non-empty list of notable objects', () => {
		const suggestions = getSuggestions();
		expect(suggestions.length).toBeGreaterThan(0);
		expect(suggestions.every((s) => s.name && s.kind)).toBe(true);
	});
});
