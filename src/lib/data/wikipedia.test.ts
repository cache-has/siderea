import { describe, it, expect, vi } from 'vitest';
import { fetchWikipediaSummary, parseSummaryResponse, resolveWikiTitle } from './wikipedia';
import { createMemoryCache } from './api-cache';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_RESPONSE = {
	title: 'Jupiter',
	extract: 'Jupiter is the fifth planet from the Sun and the largest in the Solar System.',
	content_urls: {
		desktop: { page: 'https://en.wikipedia.org/wiki/Jupiter' },
	},
	thumbnail: {
		source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter.jpg/320px-Jupiter.jpg',
		width: 320,
		height: 320,
	},
	type: 'standard',
};

const FIXTURE_DISAMBIGUATION = {
	title: 'Mercury',
	extract: '',
	content_urls: {
		desktop: { page: 'https://en.wikipedia.org/wiki/Mercury' },
	},
	type: 'disambiguation',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveWikiTitle', () => {
	it('returns override for known names', () => {
		expect(resolveWikiTitle('ISS')).toBe('International_Space_Station');
		expect(resolveWikiTitle('Sgr A*')).toBe('Sagittarius_A*');
	});

	it('replaces spaces with underscores for unknown names', () => {
		expect(resolveWikiTitle('Orion Nebula')).toBe('Orion_Nebula');
	});

	it('passes through single-word names', () => {
		expect(resolveWikiTitle('Jupiter')).toBe('Jupiter');
	});
});

describe('parseSummaryResponse', () => {
	it('parses a standard article summary', () => {
		const result = parseSummaryResponse(FIXTURE_RESPONSE);
		expect(result).not.toBeNull();
		expect(result!.title).toBe('Jupiter');
		expect(result!.extract).toContain('fifth planet');
		expect(result!.articleUrl).toBe('https://en.wikipedia.org/wiki/Jupiter');
		expect(result!.thumbnailUrl).toContain('Jupiter.jpg');
	});

	it('returns null for disambiguation pages', () => {
		expect(parseSummaryResponse(FIXTURE_DISAMBIGUATION)).toBeNull();
	});

	it('returns null when extract is empty', () => {
		const noExtract = { ...FIXTURE_RESPONSE, extract: '', type: 'no-extract' };
		expect(parseSummaryResponse(noExtract)).toBeNull();
	});
});

describe('fetchWikipediaSummary', () => {
	it('parses a successful response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(FIXTURE_RESPONSE),
			})
		);

		const result = await fetchWikipediaSummary('Jupiter');
		expect(result).not.toBeNull();
		expect(result!.data.title).toBe('Jupiter');
		expect(result!.fromCache).toBe(false);

		vi.unstubAllGlobals();
	});

	it('returns null on 404', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }))
		);

		const result = await fetchWikipediaSummary('NonexistentObject12345');
		expect(result).toBeNull();

		vi.unstubAllGlobals();
	});

	it('throws on non-404 HTTP error', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }))
		);

		const promise = fetchWikipediaSummary('Jupiter');
		// Prevent unhandled rejection warning
		const caught = promise.catch((e: unknown) => e);
		await vi.runAllTimersAsync();
		const err = await caught;
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain('500');

		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('caches results and returns from cache on second call', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve(FIXTURE_RESPONSE),
		});
		vi.stubGlobal('fetch', mockFetch);

		const cache = createMemoryCache();
		const first = await fetchWikipediaSummary('Jupiter', cache);
		expect(first).not.toBeNull();
		expect(first!.fromCache).toBe(false);
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const second = await fetchWikipediaSummary('Jupiter', cache);
		expect(second).not.toBeNull();
		expect(second!.fromCache).toBe(true);
		expect(second!.data.title).toBe('Jupiter');
		expect(mockFetch).toHaveBeenCalledTimes(1);

		vi.unstubAllGlobals();
	});
});
