import { describe, it, expect, vi } from 'vitest';
import { createMemoryCache } from './api-cache';

describe('ApiCache (in-memory fallback)', () => {
	it('returns null for missing keys', async () => {
		const cache = createMemoryCache();
		const result = await cache.get('ephemeris', 'nonexistent');
		expect(result).toBeNull();
	});

	it('round-trips data through set/get', async () => {
		const cache = createMemoryCache();
		const data = { x: 1, y: 2, z: 3 };
		await cache.set('ephemeris', 'test-key', data, 60_000);

		const hit = await cache.get<typeof data>('ephemeris', 'test-key');
		expect(hit).not.toBeNull();
		expect(hit!.data).toEqual(data);
		expect(hit!.fetchedAt).toBeLessThanOrEqual(Date.now());
	});

	it('returns null for expired entries', async () => {
		const cache = createMemoryCache();
		const now = Date.now();
		vi.spyOn(Date, 'now').mockReturnValue(now);

		await cache.set('ephemeris', 'expired', { value: 42 }, 100);

		// Advance time past TTL
		vi.spyOn(Date, 'now').mockReturnValue(now + 200);

		const hit = await cache.get('ephemeris', 'expired');
		expect(hit).toBeNull();

		vi.restoreAllMocks();
	});

	it('isolates stores from each other', async () => {
		const cache = createMemoryCache();
		await cache.set('ephemeris', 'shared-key', 'ephemeris-value', 60_000);
		await cache.set('images', 'shared-key', 'images-value', 60_000);

		const ephemeris = await cache.get<string>('ephemeris', 'shared-key');
		const images = await cache.get<string>('images', 'shared-key');

		expect(ephemeris!.data).toBe('ephemeris-value');
		expect(images!.data).toBe('images-value');
	});

	it('deletes a specific entry', async () => {
		const cache = createMemoryCache();
		await cache.set('tle', 'sat-1', { norad: 25544 }, 60_000);
		await cache.delete('tle', 'sat-1');

		const hit = await cache.get('tle', 'sat-1');
		expect(hit).toBeNull();
	});

	it('clears a single store', async () => {
		const cache = createMemoryCache();
		await cache.set('ephemeris', 'a', 1, 60_000);
		await cache.set('images', 'b', 2, 60_000);

		await cache.clear('ephemeris');

		expect(await cache.get('ephemeris', 'a')).toBeNull();
		expect(await cache.get('images', 'b')).not.toBeNull();
	});

	it('getStale returns expired entries for offline fallback', async () => {
		const cache = createMemoryCache();
		const now = Date.now();
		vi.spyOn(Date, 'now').mockReturnValue(now);

		await cache.set('ephemeris', 'old-data', { value: 99 }, 100);

		// Advance time past TTL
		vi.spyOn(Date, 'now').mockReturnValue(now + 200);

		// Regular get returns null (expired)
		const hit = await cache.get('ephemeris', 'old-data');
		expect(hit).toBeNull();

		// But we need to re-set the data since get() deletes expired entries
		vi.spyOn(Date, 'now').mockReturnValue(now);
		await cache.set('ephemeris', 'old-data-2', { value: 99 }, 100);
		vi.spyOn(Date, 'now').mockReturnValue(now + 200);

		// getStale returns the expired entry
		const staleHit = await cache.getStale<{ value: number }>('ephemeris', 'old-data-2');
		expect(staleHit).not.toBeNull();
		expect(staleHit!.data.value).toBe(99);

		vi.restoreAllMocks();
	});

	it('getStale returns null for never-cached keys', async () => {
		const cache = createMemoryCache();
		const hit = await cache.getStale('ephemeris', 'never-existed');
		expect(hit).toBeNull();
	});

	it('clears all stores when no argument given', async () => {
		const cache = createMemoryCache();
		await cache.set('ephemeris', 'a', 1, 60_000);
		await cache.set('images', 'b', 2, 60_000);
		await cache.set('tle', 'c', 3, 60_000);

		await cache.clear();

		expect(await cache.get('ephemeris', 'a')).toBeNull();
		expect(await cache.get('images', 'b')).toBeNull();
		expect(await cache.get('tle', 'c')).toBeNull();
	});
});

describe('ApiCache size monitoring and pruning', () => {
	it('getStats returns zero for empty cache', async () => {
		const cache = createMemoryCache();
		const stats = await cache.getStats();

		expect(stats.ephemeris.entries).toBe(0);
		expect(stats.ephemeris.estimatedBytes).toBe(0);
		expect(stats.images.entries).toBe(0);
	});

	it('getStats reflects stored entries', async () => {
		const cache = createMemoryCache();
		await cache.set('ephemeris', 'a', { x: 1 }, 60_000);
		await cache.set('ephemeris', 'b', { x: 2 }, 60_000);
		await cache.set('images', 'c', 'hello', 60_000);

		const stats = await cache.getStats();
		expect(stats.ephemeris.entries).toBe(2);
		expect(stats.ephemeris.estimatedBytes).toBeGreaterThan(0);
		expect(stats.images.entries).toBe(1);
		expect(stats.tle.entries).toBe(0);
	});

	it('prune removes oldest entries when over budget', async () => {
		const cache = createMemoryCache();
		const now = Date.now();

		// Add entries with different timestamps
		vi.spyOn(Date, 'now').mockReturnValue(now);
		await cache.set('ephemeris', 'old', 'old-data', 60_000);

		vi.spyOn(Date, 'now').mockReturnValue(now + 1000);
		await cache.set('ephemeris', 'mid', 'mid-data', 60_000);

		vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
		await cache.set('ephemeris', 'new', 'new-data', 60_000);

		vi.restoreAllMocks();

		// Get current size, then prune to half
		const stats = await cache.getStats();
		const totalBytes = stats.ephemeris.estimatedBytes;
		const halfBudget = Math.floor(totalBytes / 2);

		const removed = await cache.prune(halfBudget);
		expect(removed).toBeGreaterThan(0);

		// Oldest entry should be gone first
		const oldHit = await cache.getStale('ephemeris', 'old');
		expect(oldHit).toBeNull();

		// Newest entry should survive
		const newHit = await cache.getStale('ephemeris', 'new');
		expect(newHit).not.toBeNull();
	});

	it('prune returns 0 when already under budget', async () => {
		const cache = createMemoryCache();
		await cache.set('ephemeris', 'a', 'small', 60_000);

		const removed = await cache.prune(100 * 1024 * 1024); // 100 MB
		expect(removed).toBe(0);
	});

	it('prune removes from multiple stores', async () => {
		const cache = createMemoryCache();
		const now = Date.now();

		vi.spyOn(Date, 'now').mockReturnValue(now);
		await cache.set('ephemeris', 'e1', 'data-e1', 60_000);

		vi.spyOn(Date, 'now').mockReturnValue(now + 1000);
		await cache.set('images', 'i1', 'data-i1', 60_000);

		vi.restoreAllMocks();

		// Prune to 0 — should remove everything
		const removed = await cache.prune(0);
		expect(removed).toBe(2);

		expect(await cache.getStale('ephemeris', 'e1')).toBeNull();
		expect(await cache.getStale('images', 'i1')).toBeNull();
	});
});
