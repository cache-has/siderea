/**
 * Object pooling system for dynamic Three.js objects.
 *
 * Avoids GC pressure from creating/destroying meshes and sprites as
 * the camera moves through the solar system. Three main components:
 *
 * - ObjectPool<T>: generic acquire/release pool with factory + reset callbacks
 * - GeometryCache: shared sphere geometries at different LOD segment counts
 * - SceneObjectPool: high-level facade combining pools with scene-layer awareness
 */

import {
	Mesh,
	Sprite,
	SpriteMaterial,
	SphereGeometry,
	MeshStandardMaterial
} from 'three/webgpu';
import type { BufferGeometry, Scene } from 'three/webgpu';

// ---------------------------------------------------------------------------
// Generic ObjectPool
// ---------------------------------------------------------------------------

export interface PoolOptions<T> {
	/** Factory function to create a new pool object. */
	create: () => T;
	/** Reset an object to a clean state when released back to the pool. */
	reset: (obj: T) => void;
	/** Optional initial pool capacity (pre-warms this many objects). */
	initialCapacity?: number;
}

/**
 * Generic object pool. Acquire objects for use, release them back when done.
 *
 * Objects are lazily created on first acquire beyond the available supply,
 * then recycled via release(). The pool never shrinks automatically —
 * call dispose() to free everything.
 */
export class ObjectPool<T> {
	private available: T[] = [];
	private active = new Set<T>();
	private readonly factory: () => T;
	private readonly resetFn: (obj: T) => void;

	constructor(options: PoolOptions<T>) {
		this.factory = options.create;
		this.resetFn = options.reset;

		const count = options.initialCapacity ?? 0;
		for (let i = 0; i < count; i++) {
			this.available.push(this.factory());
		}
	}

	/** Number of objects currently in use. */
	get activeCount(): number {
		return this.active.size;
	}

	/** Number of objects available for reuse. */
	get availableCount(): number {
		return this.available.length;
	}

	/** Total objects managed by this pool (active + available). */
	get totalCount(): number {
		return this.active.size + this.available.length;
	}

	/** Acquire an object from the pool (creates one if none available). */
	acquire(): T {
		const obj = this.available.pop() ?? this.factory();
		this.active.add(obj);
		return obj;
	}

	/** Release an object back to the pool. Resets it to a clean state. */
	release(obj: T): void {
		if (!this.active.delete(obj)) return; // not ours — ignore silently
		this.resetFn(obj);
		this.available.push(obj);
	}

	/** Release all active objects back to the pool. */
	releaseAll(): void {
		for (const obj of this.active) {
			this.resetFn(obj);
			this.available.push(obj);
		}
		this.active.clear();
	}

	/**
	 * Dispose all objects. Calls the provided disposer on every object,
	 * then clears the pool entirely.
	 */
	dispose(disposer?: (obj: T) => void): void {
		if (disposer) {
			for (const obj of this.active) disposer(obj);
			for (const obj of this.available) disposer(obj);
		}
		this.active.clear();
		this.available.length = 0;
	}
}

// ---------------------------------------------------------------------------
// GeometryCache
// ---------------------------------------------------------------------------

/**
 * Shared geometry cache. Avoids creating duplicate SphereGeometry instances
 * for the same segment count — each unique key maps to a single GPU-uploaded
 * geometry shared across all meshes that use it.
 */
export class GeometryCache {
	private cache = new Map<string, BufferGeometry>();

	/**
	 * Get or create a SphereGeometry with the given segment count.
	 * The geometry is shared — do NOT dispose it individually.
	 */
	sphere(segments: number): SphereGeometry {
		const key = `sphere:${segments}`;
		let geo = this.cache.get(key);
		if (!geo) {
			geo = new SphereGeometry(1, segments, segments);
			this.cache.set(key, geo);
		}
		return geo as SphereGeometry;
	}

	/** Dispose all cached geometries. */
	dispose(): void {
		for (const geo of this.cache.values()) {
			geo.dispose();
		}
		this.cache.clear();
	}
}

// ---------------------------------------------------------------------------
// SceneObjectPool
// ---------------------------------------------------------------------------

/** Reset a Mesh to a neutral state for reuse. */
function resetMesh(mesh: Mesh): void {
	mesh.removeFromParent();
	mesh.position.set(0, 0, 0);
	mesh.rotation.set(0, 0, 0);
	mesh.scale.set(1, 1, 1);
	mesh.visible = true;
	mesh.userData = {};
}

/** Reset a Sprite to a neutral state for reuse. */
function resetSprite(sprite: Sprite): void {
	sprite.removeFromParent();
	sprite.position.set(0, 0, 0);
	sprite.scale.set(1, 1, 1);
	sprite.visible = true;
	sprite.userData = {};
}

export interface SceneObjectPoolOptions {
	/** Initial mesh pool capacity. @default 0 */
	meshCapacity?: number;
	/** Initial sprite pool capacity. @default 0 */
	spriteCapacity?: number;
	/** Default sphere segment count for mesh geometry. @default 16 */
	defaultSegments?: number;
}

/**
 * High-level pool for Three.js scene objects used in the solar system.
 *
 * Manages two sub-pools:
 * - **Meshes** with shared SphereGeometry (for planets, moons, dwarf planets)
 * - **Sprites** with SpriteMaterial (for satellites, markers, small objects)
 *
 * Objects are acquired into a specific scene (layer) and automatically
 * removed from the scene on release.
 */
export class SceneObjectPool {
	readonly meshes: ObjectPool<Mesh>;
	readonly sprites: ObjectPool<Sprite>;
	readonly geometryCache: GeometryCache;

	private readonly defaultSegments: number;

	constructor(options: SceneObjectPoolOptions = {}) {
		this.defaultSegments = options.defaultSegments ?? 16;
		this.geometryCache = new GeometryCache();

		const defaultGeo = this.geometryCache.sphere(this.defaultSegments);

		this.meshes = new ObjectPool<Mesh>({
			create: () => new Mesh(defaultGeo, new MeshStandardMaterial()),
			reset: resetMesh,
			initialCapacity: options.meshCapacity ?? 0
		});

		this.sprites = new ObjectPool<Sprite>({
			create: () => new Sprite(new SpriteMaterial()),
			reset: resetSprite,
			initialCapacity: options.spriteCapacity ?? 0
		});
	}

	/**
	 * Acquire a mesh and add it to the given scene.
	 * Caller is responsible for setting position, scale, and material properties.
	 */
	acquireMesh(scene: Scene): Mesh {
		const mesh = this.meshes.acquire();
		scene.add(mesh);
		return mesh;
	}

	/**
	 * Acquire a sprite and add it to the given scene.
	 * Caller is responsible for setting position, scale, and material properties.
	 */
	acquireSprite(scene: Scene): Sprite {
		const sprite = this.sprites.acquire();
		scene.add(sprite);
		return sprite;
	}

	/** Release a mesh back to the pool (removes from scene automatically). */
	releaseMesh(mesh: Mesh): void {
		this.meshes.release(mesh);
	}

	/** Release a sprite back to the pool (removes from scene automatically). */
	releaseSprite(sprite: Sprite): void {
		this.sprites.release(sprite);
	}

	/** Release all active meshes and sprites. */
	releaseAll(): void {
		this.meshes.releaseAll();
		this.sprites.releaseAll();
	}

	/** Dispose all pools and cached geometries. */
	dispose(): void {
		this.meshes.dispose((mesh) => {
			// Don't dispose shared geometry — GeometryCache owns it
			const mat = mesh.material;
			if (mat && 'dispose' in mat && typeof mat.dispose === 'function') {
				mat.dispose();
			}
			mesh.removeFromParent();
		});

		this.sprites.dispose((sprite) => {
			const mat = sprite.material;
			if (mat && 'dispose' in mat && typeof mat.dispose === 'function') {
				mat.dispose();
			}
			sprite.removeFromParent();
		});

		this.geometryCache.dispose();
	}

	/** Pool statistics for performance monitoring. */
	get stats(): {
		meshActive: number;
		meshAvailable: number;
		spriteActive: number;
		spriteAvailable: number;
		cachedGeometries: number;
	} {
		return {
			meshActive: this.meshes.activeCount,
			meshAvailable: this.meshes.availableCount,
			spriteActive: this.sprites.activeCount,
			spriteAvailable: this.sprites.availableCount,
			cachedGeometries: this.geometryCache['cache'].size
		};
	}
}
