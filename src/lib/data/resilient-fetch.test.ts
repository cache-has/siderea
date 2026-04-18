import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resilientFetch, parseRetryAfter, HttpError } from './resilient-fetch';

describe('parseRetryAfter', () => {
	it('returns null for null input', () => {
		expect(parseRetryAfter(null)).toBeNull();
	});

	it('parses integer seconds', () => {
		expect(parseRetryAfter('30')).toBe(30_000);
	});

	it('parses zero', () => {
		expect(parseRetryAfter('0')).toBe(0);
	});

	it('returns null for garbage', () => {
		expect(parseRetryAfter('not-a-date-or-number')).toBeNull();
	});
});

describe('resilientFetch', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns response on first success', async () => {
		fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));

		const res = await resilientFetch('https://example.com');
		expect(res.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('retries on 500 and succeeds', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Server Error' }))
			.mockResolvedValueOnce(new Response('ok', { status: 200 }));

		const res = await resilientFetch('https://example.com', undefined, {
			maxRetries: 2,
			initialDelayMs: 1, // fast for tests
		});

		expect(res.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('throws HttpError on non-retryable 4xx', async () => {
		fetchMock.mockResolvedValueOnce(new Response('', { status: 404, statusText: 'Not Found' }));

		await expect(
			resilientFetch('https://example.com', undefined, { maxRetries: 2, initialDelayMs: 1 })
		).rejects.toThrow(HttpError);

		// Should NOT retry on 404
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('retries on 429 rate limit', async () => {
		const headers429 = new Headers({ 'Retry-After': '0' });
		fetchMock
			.mockResolvedValueOnce(new Response('', { status: 429, statusText: 'Too Many Requests', headers: headers429 }))
			.mockResolvedValueOnce(new Response('ok', { status: 200 }));

		const res = await resilientFetch('https://example.com', undefined, {
			maxRetries: 2,
			initialDelayMs: 1,
		});

		expect(res.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('retries on network error (TypeError)', async () => {
		fetchMock
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(new Response('ok', { status: 200 }));

		const res = await resilientFetch('https://example.com', undefined, {
			maxRetries: 2,
			initialDelayMs: 1,
		});

		expect(res.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('throws after exhausting retries', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(
			resilientFetch('https://example.com', undefined, {
				maxRetries: 2,
				initialDelayMs: 1,
			})
		).rejects.toThrow(TypeError);

		// 1 initial + 2 retries = 3
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('does not retry on AbortError', async () => {
		const controller = new AbortController();
		controller.abort();

		fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

		await expect(
			resilientFetch('https://example.com', { signal: controller.signal }, {
				maxRetries: 3,
				initialDelayMs: 1,
			})
		).rejects.toThrow();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
