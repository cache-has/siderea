import { describe, it, expect, vi } from 'vitest';
import { fetchExoplanets, resolveHostname } from './exoplanets';
import { createMemoryCache } from './api-cache';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_RESPONSE = [
	{
		pl_name: 'Proxima Cen b',
		hostname: 'Proxima Cen',
		pl_orbper: 11.186,
		pl_orbsmax: 0.04857,
		pl_bmasse: 1.07,
		pl_rade: null,
		discoverymethod: 'Radial Velocity',
		disc_year: 2016,
		pl_orbeccen: 0.02,
		pl_orbincl: null,
		sy_pnum: 2,
	},
	{
		pl_name: 'Proxima Cen d',
		hostname: 'Proxima Cen',
		pl_orbper: 5.122,
		pl_orbsmax: 0.02885,
		pl_bmasse: 0.26,
		pl_rade: null,
		discoverymethod: 'Radial Velocity',
		disc_year: 2022,
		pl_orbeccen: 0.04,
		pl_orbincl: null,
		sy_pnum: 2,
	},
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveHostname', () => {
	it('maps known Siderea names to archive hostnames', () => {
		expect(resolveHostname('Proxima Centauri')).toBe('Proxima Cen');
		expect(resolveHostname('Helvetios')).toBe('51 Peg');
		expect(resolveHostname('Ran')).toBe('eps Eri');
		expect(resolveHostname("Luyten's Star")).toBe('GJ 273');
	});

	it('passes through unmapped names unchanged', () => {
		expect(resolveHostname('Pollux')).toBe('Pollux');
		expect(resolveHostname('SomeUnknownStar')).toBe('SomeUnknownStar');
	});
});

describe('fetchExoplanets', () => {
	it('parses a successful response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(FIXTURE_RESPONSE),
			})
		);

		const result = await fetchExoplanets('Proxima Centauri');
		expect(result).not.toBeNull();
		expect(result!.data.hostname).toBe('Proxima Cen');
		expect(result!.data.planetCount).toBe(2);
		expect(result!.data.planets).toHaveLength(2);

		const b = result!.data.planets[0];
		expect(b.name).toBe('Proxima Cen b');
		expect(b.orbitalPeriodDays).toBeCloseTo(11.186);
		expect(b.semiMajorAxisAU).toBeCloseTo(0.04857);
		expect(b.massEarth).toBeCloseTo(1.07);
		expect(b.discoveryMethod).toBe('Radial Velocity');
		expect(b.discoveryYear).toBe(2016);
		expect(result!.fromCache).toBe(false);

		vi.unstubAllGlobals();
	});

	it('returns null when no planets found', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve([]),
			})
		);

		const result = await fetchExoplanets('SomeStarWithNoPlanets');
		expect(result).toBeNull();

		vi.unstubAllGlobals();
	});

	it('throws on HTTP error', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }))
		);

		const promise = fetchExoplanets('Proxima Centauri');
		const caught = promise.catch((e: unknown) => e);
		await vi.runAllTimersAsync();
		const err = await caught;
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain('503');

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
		const first = await fetchExoplanets('Proxima Centauri', cache);
		expect(first).not.toBeNull();
		expect(first!.fromCache).toBe(false);
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const second = await fetchExoplanets('Proxima Centauri', cache);
		expect(second).not.toBeNull();
		expect(second!.fromCache).toBe(true);
		expect(second!.data.planets).toHaveLength(2);
		expect(mockFetch).toHaveBeenCalledTimes(1);

		vi.unstubAllGlobals();
	});

	it('uses mapped hostname in query URL', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve([]),
		});
		vi.stubGlobal('fetch', mockFetch);

		await fetchExoplanets('Helvetios');

		const calledUrl = mockFetch.mock.calls[0][0] as string;
		expect(calledUrl).toContain('51+Peg');

		vi.unstubAllGlobals();
	});
});
