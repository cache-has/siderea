import { describe, it, expect } from 'vitest';
import { Scene, Mesh, Sprite, SphereGeometry } from 'three/webgpu';
import { ObjectPool, GeometryCache, SceneObjectPool } from './object-pool';

// ---------------------------------------------------------------------------
// ObjectPool<T>
// ---------------------------------------------------------------------------

describe('ObjectPool', () => {
	function makePool(initialCapacity = 0) {
		let created = 0;
		let resets = 0;
		const pool = new ObjectPool<{ id: number }>({
			create: () => ({ id: ++created }),
			reset: () => { resets++; },
			initialCapacity
		});
		return { pool, getCreated: () => created, getResets: () => resets };
	}

	it('creates objects on acquire when pool is empty', () => {
		const { pool, getCreated } = makePool();
		const a = pool.acquire();
		const b = pool.acquire();

		expect(a.id).toBe(1);
		expect(b.id).toBe(2);
		expect(getCreated()).toBe(2);
		expect(pool.activeCount).toBe(2);
		expect(pool.availableCount).toBe(0);
	});

	it('pre-warms with initialCapacity', () => {
		const { pool, getCreated } = makePool(3);
		expect(getCreated()).toBe(3);
		expect(pool.availableCount).toBe(3);
		expect(pool.activeCount).toBe(0);
	});

	it('reuses released objects instead of creating new ones', () => {
		const { pool, getCreated } = makePool();
		const a = pool.acquire();
		pool.release(a);
		const b = pool.acquire();

		expect(b).toBe(a); // same reference
		expect(getCreated()).toBe(1); // only created once
	});

	it('calls reset on release', () => {
		const { pool, getResets } = makePool();
		const obj = pool.acquire();
		pool.release(obj);
		expect(getResets()).toBe(1);
	});

	it('ignores release of unknown objects', () => {
		const { pool } = makePool();
		pool.release({ id: 999 }); // not from this pool
		expect(pool.availableCount).toBe(0);
	});

	it('releaseAll returns all active objects', () => {
		const { pool, getResets } = makePool();
		pool.acquire();
		pool.acquire();
		pool.acquire();
		expect(pool.activeCount).toBe(3);

		pool.releaseAll();
		expect(pool.activeCount).toBe(0);
		expect(pool.availableCount).toBe(3);
		expect(getResets()).toBe(3);
	});

	it('dispose clears everything and calls disposer', () => {
		const disposed: number[] = [];
		const { pool } = makePool(2);
		pool.acquire(); // 1 active, 1 available

		pool.dispose((obj) => disposed.push(obj.id));

		expect(pool.activeCount).toBe(0);
		expect(pool.availableCount).toBe(0);
		expect(pool.totalCount).toBe(0);
		expect(disposed).toHaveLength(2);
	});

	it('reports correct totalCount', () => {
		const { pool } = makePool();
		pool.acquire();
		pool.acquire();
		const c = pool.acquire();
		pool.release(c);

		expect(pool.totalCount).toBe(3); // 2 active + 1 available
	});
});

// ---------------------------------------------------------------------------
// GeometryCache
// ---------------------------------------------------------------------------

describe('GeometryCache', () => {
	it('returns the same geometry for the same segment count', () => {
		const cache = new GeometryCache();
		const a = cache.sphere(16);
		const b = cache.sphere(16);
		expect(a).toBe(b);
	});

	it('returns different geometries for different segment counts', () => {
		const cache = new GeometryCache();
		const a = cache.sphere(8);
		const b = cache.sphere(32);
		expect(a).not.toBe(b);
	});

	it('creates SphereGeometry instances', () => {
		const cache = new GeometryCache();
		const geo = cache.sphere(12);
		expect(geo).toBeInstanceOf(SphereGeometry);
	});

	it('dispose clears the cache', () => {
		const cache = new GeometryCache();
		cache.sphere(8);
		cache.sphere(16);
		cache.dispose();
		// After dispose, a new call should create a fresh geometry
		const fresh = cache.sphere(8);
		expect(fresh).toBeInstanceOf(SphereGeometry);
	});
});

// ---------------------------------------------------------------------------
// SceneObjectPool
// ---------------------------------------------------------------------------

describe('SceneObjectPool', () => {
	it('acquires a mesh into the given scene', () => {
		const pool = new SceneObjectPool();
		const scene = new Scene();
		const mesh = pool.acquireMesh(scene);

		expect(mesh).toBeInstanceOf(Mesh);
		expect(scene.children).toContain(mesh);
		expect(pool.meshes.activeCount).toBe(1);
	});

	it('acquires a sprite into the given scene', () => {
		const pool = new SceneObjectPool();
		const scene = new Scene();
		const sprite = pool.acquireSprite(scene);

		expect(sprite).toBeInstanceOf(Sprite);
		expect(scene.children).toContain(sprite);
		expect(pool.sprites.activeCount).toBe(1);
	});

	it('removes mesh from scene on release', () => {
		const pool = new SceneObjectPool();
		const scene = new Scene();
		const mesh = pool.acquireMesh(scene);

		pool.releaseMesh(mesh);
		expect(scene.children).not.toContain(mesh);
		expect(pool.meshes.availableCount).toBe(1);
	});

	it('removes sprite from scene on release', () => {
		const pool = new SceneObjectPool();
		const scene = new Scene();
		const sprite = pool.acquireSprite(scene);

		pool.releaseSprite(sprite);
		expect(scene.children).not.toContain(sprite);
		expect(pool.sprites.availableCount).toBe(1);
	});

	it('reuses released mesh with reset transform', () => {
		const pool = new SceneObjectPool();
		const scene = new Scene();
		const mesh = pool.acquireMesh(scene);
		mesh.position.set(10, 20, 30);
		mesh.userData = { planet: 'mars' };

		pool.releaseMesh(mesh);
		const reused = pool.acquireMesh(scene);

		expect(reused).toBe(mesh);
		expect(reused.position.x).toBe(0);
		expect(reused.position.y).toBe(0);
		expect(reused.position.z).toBe(0);
		expect(reused.userData).toEqual({});
	});

	it('releaseAll clears all active objects from scenes', () => {
		const pool = new SceneObjectPool();
		const scene1 = new Scene();
		const scene2 = new Scene();
		pool.acquireMesh(scene1);
		pool.acquireSprite(scene2);

		pool.releaseAll();
		expect(scene1.children).toHaveLength(0);
		expect(scene2.children).toHaveLength(0);
		expect(pool.meshes.activeCount).toBe(0);
		expect(pool.sprites.activeCount).toBe(0);
	});

	it('shares geometry via cache', () => {
		const pool = new SceneObjectPool({ defaultSegments: 12 });
		const scene = new Scene();
		const m1 = pool.acquireMesh(scene);
		const m2 = pool.acquireMesh(scene);

		// Both should reference the same cached geometry
		expect(m1.geometry).toBe(m2.geometry);
	});

	it('reports stats correctly', () => {
		const pool = new SceneObjectPool();
		const scene = new Scene();
		pool.acquireMesh(scene);
		pool.acquireMesh(scene);
		pool.acquireSprite(scene);

		const stats = pool.stats;
		expect(stats.meshActive).toBe(2);
		expect(stats.meshAvailable).toBe(0);
		expect(stats.spriteActive).toBe(1);
		expect(stats.spriteAvailable).toBe(0);
		expect(stats.cachedGeometries).toBe(1); // default sphere
	});

	it('dispose cleans up everything', () => {
		const pool = new SceneObjectPool();
		const scene = new Scene();
		pool.acquireMesh(scene);
		pool.acquireSprite(scene);

		pool.dispose();
		expect(pool.meshes.activeCount).toBe(0);
		expect(pool.sprites.activeCount).toBe(0);
	});
});
