/**
 * Resilient fetch wrapper with exponential backoff and HTTP 429 handling.
 *
 * Wraps the global `fetch` to automatically retry on transient failures
 * (network errors, 5xx responses, 429 rate limits). Designed for the
 * data-fetching layer — all API clients should use this instead of bare fetch.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResilientFetchOptions {
	/** Maximum number of retry attempts (default: 3). */
	maxRetries?: number;
	/** Initial backoff delay in ms (default: 1000). Doubles each retry. */
	initialDelayMs?: number;
	/** Maximum backoff delay in ms (default: 30000). */
	maxDelayMs?: number;
	/** Optional AbortSignal to cancel retries. */
	signal?: AbortSignal;
}

/** Error subclass that preserves the HTTP status for callers. */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly statusText: string,
		message?: string
	) {
		super(message ?? `HTTP ${status}: ${statusText}`);
		this.name = 'HttpError';
	}

	get isRateLimit(): boolean {
		return this.status === 429;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Whether an HTTP status code is retryable. */
function isRetryableStatus(status: number): boolean {
	return status === 429 || (status >= 500 && status <= 599);
}

/** Parse the Retry-After header value into milliseconds. */
export function parseRetryAfter(header: string | null): number | null {
	if (!header) return null;

	// Retry-After can be seconds (integer) or an HTTP-date
	const seconds = parseInt(header, 10);
	if (!isNaN(seconds) && seconds >= 0) {
		return seconds * 1000;
	}

	// Try parsing as HTTP-date
	const date = Date.parse(header);
	if (!isNaN(date)) {
		const delayMs = date - Date.now();
		return delayMs > 0 ? delayMs : 0;
	}

	return null;
}

/** Sleep for a given number of milliseconds, respecting an AbortSignal. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
			return;
		}

		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
		}, { once: true });
	});
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Fetch with automatic retry on transient failures.
 *
 * Retries on:
 * - Network errors (TypeError from fetch — offline or DNS failure)
 * - HTTP 5xx server errors
 * - HTTP 429 rate limits (respects Retry-After header)
 *
 * Does NOT retry on:
 * - HTTP 4xx client errors (except 429)
 * - Abort signals
 */
export async function resilientFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
	options?: ResilientFetchOptions
): Promise<Response> {
	const maxRetries = options?.maxRetries ?? 3;
	const initialDelayMs = options?.initialDelayMs ?? 1000;
	const maxDelayMs = options?.maxDelayMs ?? 30_000;
	const signal = options?.signal ?? init?.signal ?? undefined;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(input, init);

			if (response.ok) return response;

			// Non-retryable client error (4xx except 429)
			if (!isRetryableStatus(response.status)) {
				throw new HttpError(response.status, response.statusText);
			}

			// Retryable — compute delay
			lastError = new HttpError(response.status, response.statusText);

			if (attempt < maxRetries) {
				let delayMs: number;
				if (response.status === 429) {
					const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
					delayMs = retryAfter ?? initialDelayMs * Math.pow(2, attempt);
				} else {
					delayMs = initialDelayMs * Math.pow(2, attempt);
				}
				delayMs = Math.min(delayMs, maxDelayMs);
				await sleep(delayMs, signal);
			}
		} catch (err) {
			// Abort — don't retry
			if (err instanceof DOMException && err.name === 'AbortError') throw err;

			// Non-retryable HttpError (4xx except 429) — throw immediately
			if (err instanceof HttpError && !isRetryableStatus(err.status)) throw err;

			// Network error (TypeError) — retryable
			if (err instanceof TypeError) {
				lastError = err;
				if (attempt < maxRetries) {
					const delayMs = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
					await sleep(delayMs, signal);
				}
				continue;
			}

			// Unknown error — don't retry
			throw err;
		}
	}

	throw lastError ?? new Error('resilientFetch: exhausted retries');
}
