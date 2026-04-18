/**
 * General-purpose IndexedDB cache with TTL for API responses.
 *
 * Provides four object stores (ephemeris, images, tle, details) shared by
 * all API clients in the data-fetching layer. Falls back to an in-memory
 * Map when IndexedDB is unavailable (e.g. private browsing in some browsers).
 *
 * Includes size monitoring and LRU eviction to keep cache within budget.
 */

const DB_NAME = 'siderea-cache';
const DB_VERSION = 1;

/** Available object stores — one per API domain. */
export type CacheStoreName = 'ephemeris' | 'images' | 'tle' | 'details';

const STORE_NAMES: CacheStoreName[] = ['ephemeris', 'images', 'tle', 'details'];

/** Shape of a stored cache entry (internal). */
interface CacheRecord<T = unknown> {
	key: string;
	data: T;
	fetchedAt: number;
	ttlMs: number;
}

/** Result returned from a cache hit. */
export interface CacheHit<T> {
	data: T;
	fetchedAt: number;
}

/** Per-store size statistics. */
export interface CacheStoreStats {
	entries: number;
	estimatedBytes: number;
}

/** Cache interface — implemented by both IndexedDB and in-memory backends. */
export interface ApiCache {
	get<T>(store: CacheStoreName, key: string): Promise<CacheHit<T> | null>;
	/**
	 * Get a cache entry even if its TTL has expired. Used for offline fallback —
	 * stale data is better than no data when the network is unavailable.
	 * Returns null only if the key was never cached.
	 */
	getStale<T>(store: CacheStoreName, key: string): Promise<CacheHit<T> | null>;
	set<T>(store: CacheStoreName, key: string, data: T, ttlMs: number): Promise<void>;
	delete(store: CacheStoreName, key: string): Promise<void>;
	clear(store?: CacheStoreName): Promise<void>;
	/** Get size statistics for all stores. */
	getStats(): Promise<Record<CacheStoreName, CacheStoreStats>>;
	/**
	 * Evict oldest entries until total estimated size is under maxBytes.
	 * Returns the number of entries removed.
	 */
	prune(maxBytes: number): Promise<number>;
}

/** Default max cache size: 50 MB. */
export const DEFAULT_MAX_CACHE_BYTES = 50 * 1024 * 1024;

/** Estimate serialized byte size of a value. */
function estimateRecordBytes(record: CacheRecord): number {
	// JSON.stringify gives a reasonable byte-size proxy for structured-cloneable data
	try {
		return JSON.stringify(record).length * 2; // ×2 for UTF-16 internal representation
	} catch {
		return 1024; // fallback estimate for non-serializable data
	}
}

// ---------------------------------------------------------------------------
// IndexedDB backend
// ---------------------------------------------------------------------------

class IDBCache implements ApiCache {
	private writeCount = 0;
	private maxBytes: number;

	constructor(private db: IDBDatabase, maxBytes: number) {
		this.maxBytes = maxBytes;
	}

	get<T>(store: CacheStoreName, key: string): Promise<CacheHit<T> | null> {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(store, 'readwrite');
			const os = tx.objectStore(store);
			const req = os.get(key);
			req.onsuccess = () => {
				const record = req.result as CacheRecord<T> | undefined;
				if (!record) { resolve(null); return; }
				if (record.fetchedAt + record.ttlMs < Date.now()) {
					// Expired — delete lazily
					os.delete(key);
					resolve(null);
					return;
				}
				resolve({ data: record.data, fetchedAt: record.fetchedAt });
			};
			req.onerror = () => reject(req.error);
		});
	}

	getStale<T>(store: CacheStoreName, key: string): Promise<CacheHit<T> | null> {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(store, 'readonly');
			const os = tx.objectStore(store);
			const req = os.get(key);
			req.onsuccess = () => {
				const record = req.result as CacheRecord<T> | undefined;
				if (!record) { resolve(null); return; }
				// Return regardless of TTL — caller knows it may be stale
				resolve({ data: record.data, fetchedAt: record.fetchedAt });
			};
			req.onerror = () => reject(req.error);
		});
	}

	set<T>(store: CacheStoreName, key: string, data: T, ttlMs: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(store, 'readwrite');
			const os = tx.objectStore(store);
			const record: CacheRecord<T> = { key, data, fetchedAt: Date.now(), ttlMs };
			const req = os.put(record);
			req.onsuccess = () => {
				// Auto-prune every 50 writes to avoid unbounded growth
				this.writeCount++;
				if (this.writeCount >= 50) {
					this.writeCount = 0;
					this.prune(this.maxBytes).catch(() => {/* best-effort */});
				}
				resolve();
			};
			req.onerror = () => reject(req.error);
		});
	}

	delete(store: CacheStoreName, key: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(store, 'readwrite');
			const os = tx.objectStore(store);
			const req = os.delete(key);
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	}

	clear(store?: CacheStoreName): Promise<void> {
		const stores = store ? [store] : STORE_NAMES;
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(stores, 'readwrite');
			for (const s of stores) {
				tx.objectStore(s).clear();
			}
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async getStats(): Promise<Record<CacheStoreName, CacheStoreStats>> {
		const result = {} as Record<CacheStoreName, CacheStoreStats>;
		for (const storeName of STORE_NAMES) {
			result[storeName] = await this.getStoreStats(storeName);
		}
		return result;
	}

	private getStoreStats(storeName: CacheStoreName): Promise<CacheStoreStats> {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(storeName, 'readonly');
			const os = tx.objectStore(storeName);
			let entries = 0;
			let estimatedBytes = 0;

			const cursorReq = os.openCursor();
			cursorReq.onsuccess = () => {
				const cursor = cursorReq.result;
				if (cursor) {
					entries++;
					estimatedBytes += estimateRecordBytes(cursor.value as CacheRecord);
					cursor.continue();
				} else {
					resolve({ entries, estimatedBytes });
				}
			};
			cursorReq.onerror = () => reject(cursorReq.error);
		});
	}

	async prune(maxBytes: number): Promise<number> {
		// Collect all records with their store, key, fetchedAt, and estimated size
		const allEntries: { store: CacheStoreName; key: string; fetchedAt: number; bytes: number }[] = [];

		for (const storeName of STORE_NAMES) {
			await new Promise<void>((resolve, reject) => {
				const tx = this.db.transaction(storeName, 'readonly');
				const os = tx.objectStore(storeName);
				const cursorReq = os.openCursor();
				cursorReq.onsuccess = () => {
					const cursor = cursorReq.result;
					if (cursor) {
						const record = cursor.value as CacheRecord;
						allEntries.push({
							store: storeName,
							key: record.key,
							fetchedAt: record.fetchedAt,
							bytes: estimateRecordBytes(record)
						});
						cursor.continue();
					} else {
						resolve();
					}
				};
				cursorReq.onerror = () => reject(cursorReq.error);
			});
		}

		let totalBytes = allEntries.reduce((sum, e) => sum + e.bytes, 0);
		if (totalBytes <= maxBytes) return 0;

		// Sort by fetchedAt ascending (oldest first) for LRU eviction
		allEntries.sort((a, b) => a.fetchedAt - b.fetchedAt);

		let removed = 0;
		for (const entry of allEntries) {
			if (totalBytes <= maxBytes) break;
			await this.delete(entry.store, entry.key);
			totalBytes -= entry.bytes;
			removed++;
		}

		return removed;
	}
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

class MemoryCache implements ApiCache {
	private stores = new Map<string, Map<string, CacheRecord>>();
	private maxBytes: number;
	private writeCount = 0;

	constructor(maxBytes: number = DEFAULT_MAX_CACHE_BYTES) {
		this.maxBytes = maxBytes;
	}

	private getStore(store: CacheStoreName): Map<string, CacheRecord> {
		let s = this.stores.get(store);
		if (!s) { s = new Map(); this.stores.set(store, s); }
		return s;
	}

	async get<T>(store: CacheStoreName, key: string): Promise<CacheHit<T> | null> {
		const s = this.getStore(store);
		const record = s.get(key) as CacheRecord<T> | undefined;
		if (!record) return null;
		if (record.fetchedAt + record.ttlMs < Date.now()) {
			s.delete(key);
			return null;
		}
		return { data: record.data, fetchedAt: record.fetchedAt };
	}

	async getStale<T>(store: CacheStoreName, key: string): Promise<CacheHit<T> | null> {
		const s = this.getStore(store);
		const record = s.get(key) as CacheRecord<T> | undefined;
		if (!record) return null;
		return { data: record.data, fetchedAt: record.fetchedAt };
	}

	async set<T>(store: CacheStoreName, key: string, data: T, ttlMs: number): Promise<void> {
		this.getStore(store).set(key, { key, data, fetchedAt: Date.now(), ttlMs });
		// Auto-prune every 50 writes
		this.writeCount++;
		if (this.writeCount >= 50) {
			this.writeCount = 0;
			await this.prune(this.maxBytes);
		}
	}

	async delete(store: CacheStoreName, key: string): Promise<void> {
		this.getStore(store).delete(key);
	}

	async clear(store?: CacheStoreName): Promise<void> {
		if (store) {
			this.stores.delete(store);
		} else {
			this.stores.clear();
		}
	}

	async getStats(): Promise<Record<CacheStoreName, CacheStoreStats>> {
		const result = {} as Record<CacheStoreName, CacheStoreStats>;
		for (const storeName of STORE_NAMES) {
			const s = this.stores.get(storeName);
			if (!s) {
				result[storeName] = { entries: 0, estimatedBytes: 0 };
				continue;
			}
			let estimatedBytes = 0;
			for (const record of s.values()) {
				estimatedBytes += estimateRecordBytes(record);
			}
			result[storeName] = { entries: s.size, estimatedBytes };
		}
		return result;
	}

	async prune(maxBytes: number): Promise<number> {
		const allEntries: { store: CacheStoreName; key: string; fetchedAt: number; bytes: number }[] = [];
		for (const storeName of STORE_NAMES) {
			const s = this.stores.get(storeName);
			if (!s) continue;
			for (const record of s.values()) {
				allEntries.push({
					store: storeName,
					key: record.key,
					fetchedAt: record.fetchedAt,
					bytes: estimateRecordBytes(record)
				});
			}
		}

		let totalBytes = allEntries.reduce((sum, e) => sum + e.bytes, 0);
		if (totalBytes <= maxBytes) return 0;

		allEntries.sort((a, b) => a.fetchedAt - b.fetchedAt);

		let removed = 0;
		for (const entry of allEntries) {
			if (totalBytes <= maxBytes) break;
			this.getStore(entry.store).delete(entry.key);
			totalBytes -= entry.bytes;
			removed++;
		}

		return removed;
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an in-memory cache (for testing or fallback). */
export function createMemoryCache(maxBytes?: number): ApiCache {
	return new MemoryCache(maxBytes);
}

/** Open (or create) the IndexedDB cache. Falls back to in-memory if IDB is unavailable. */
export async function createApiCache(maxBytes: number = DEFAULT_MAX_CACHE_BYTES): Promise<ApiCache> {
	if (typeof indexedDB === 'undefined') {
		console.warn('[siderea] IndexedDB unavailable — using in-memory cache');
		return new MemoryCache(maxBytes);
	}

	try {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				for (const name of STORE_NAMES) {
					if (!db.objectStoreNames.contains(name)) {
						db.createObjectStore(name, { keyPath: 'key' });
					}
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return new IDBCache(db, maxBytes);
	} catch (err) {
		console.warn('[siderea] IndexedDB open failed — using in-memory cache', err);
		return new MemoryCache(maxBytes);
	}
}
