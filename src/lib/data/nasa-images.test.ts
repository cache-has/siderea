import { describe, it, expect, vi } from 'vitest';
import { fetchNasaImage } from './nasa-images';
import { createMemoryCache } from './api-cache';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_RESPONSE = {
	collection: {
		metadata: { total_hits: 316 },
		items: [
			{
				href: 'https://images-assets.nasa.gov/image/PIA14417/collection.json',
				data: [
					{
						nasa_id: 'PIA14417',
						title: 'Jupiter Great Red Spot',
						description: 'A stunning view of Jupiter.',
						secondary_creator: 'NASA/JPL-Caltech',
						center: 'JPL',
						date_created: '2011-08-10T21:00:09Z',
						media_type: 'image',
					},
				],
				links: [
					{
						href: 'https://images-assets.nasa.gov/image/PIA14417/PIA14417~thumb.jpg',
						rel: 'preview',
						render: 'image',
					},
				],
			},
		],
	},
};

const FIXTURE_EMPTY = {
	collection: {
		metadata: { total_hits: 0 },
		items: [],
	},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchNasaImage', () => {
	it('parses a successful response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(FIXTURE_RESPONSE),
			})
		);

		const result = await fetchNasaImage('jupiter');
		expect(result).not.toBeNull();
		expect(result!.data.nasaId).toBe('PIA14417');
		expect(result!.data.title).toBe('Jupiter Great Red Spot');
		expect(result!.data.thumbUrl).toContain('~thumb.jpg');
		expect(result!.data.originalUrl).toContain('PIA14417~orig.jpg');
		expect(result!.data.credit).toBe('NASA/JPL-Caltech');
		expect(result!.fromCache).toBe(false);

		vi.unstubAllGlobals();
	});

	it('returns null when no results found', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(FIXTURE_EMPTY),
			})
		);

		const result = await fetchNasaImage('nonexistentthing12345');
		expect(result).toBeNull();

		vi.unstubAllGlobals();
	});

	it('throws on HTTP error', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }))
		);

		const promise = fetchNasaImage('jupiter');
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
			json: () => Promise.resolve(FIXTURE_RESPONSE),
		});
		vi.stubGlobal('fetch', mockFetch);

		const cache = createMemoryCache();
		const first = await fetchNasaImage('jupiter', cache);
		expect(first).not.toBeNull();
		expect(first!.fromCache).toBe(false);
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const second = await fetchNasaImage('jupiter', cache);
		expect(second).not.toBeNull();
		expect(second!.fromCache).toBe(true);
		expect(second!.data.nasaId).toBe('PIA14417');
		// fetch should NOT have been called again
		expect(mockFetch).toHaveBeenCalledTimes(1);

		vi.unstubAllGlobals();
	});
});
