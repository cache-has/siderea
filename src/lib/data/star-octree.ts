/**
 * Octree spatial index for the star catalog.
 *
 * Provides efficient:
 *   - Range queries (which stars are in a given AABB)
 *   - Nearest-neighbor search (for click/hover selection)
 *   - LOD support (each node stores its brightest star for progressive rendering)
 *
 * Coordinates: J2000 equatorial, parsecs.
 */

import type { StarCatalogData } from './types';

/** Maximum depth of the octree. */
const MAX_DEPTH = 12;

/** Maximum stars per leaf node before splitting. */
const MAX_LEAF_SIZE = 64;

/** Axis-aligned bounding box. */
export interface AABB {
	minX: number;
	minY: number;
	minZ: number;
	maxX: number;
	maxY: number;
	maxZ: number;
}

/** An octree node (internal or leaf). */
interface OctreeNode {
	bounds: AABB;
	/** Star indices stored at this leaf (null for internal nodes). */
	stars: Uint32Array | null;
	/** Eight children (null for leaf nodes). */
	children: (OctreeNode | null)[] | null;
	/** Index of the brightest star in this subtree (for LOD). */
	brightestStar: number;
	/** Apparent magnitude of the brightest star. */
	brightestMag: number;
}

/** Built octree ready for queries. */
export interface StarOctree {
	root: OctreeNode;
	catalog: StarCatalogData;
}

/**
 * Build an octree from the star catalog data.
 * Typically takes <50ms for ~120K stars.
 */
export function buildOctree(catalog: StarCatalogData): StarOctree {
	const { count, positions } = catalog;

	// Compute bounding box
	let minX = Infinity,
		minY = Infinity,
		minZ = Infinity;
	let maxX = -Infinity,
		maxY = -Infinity,
		maxZ = -Infinity;

	for (let i = 0; i < count; i++) {
		const x = positions[i * 3];
		const y = positions[i * 3 + 1];
		const z = positions[i * 3 + 2];
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (z < minZ) minZ = z;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
		if (z > maxZ) maxZ = z;
	}

	// Pad slightly to avoid edge cases
	const pad = 1.0;
	const bounds: AABB = {
		minX: minX - pad,
		minY: minY - pad,
		minZ: minZ - pad,
		maxX: maxX + pad,
		maxY: maxY + pad,
		maxZ: maxZ + pad
	};

	// Create initial index array
	const allIndices = new Uint32Array(count);
	for (let i = 0; i < count; i++) allIndices[i] = i;

	const root = buildNode(catalog, allIndices, bounds, 0);
	return { root, catalog };
}

function buildNode(
	catalog: StarCatalogData,
	indices: Uint32Array,
	bounds: AABB,
	depth: number
): OctreeNode {
	const { positions, apparentMag } = catalog;

	// Find brightest star in this set
	let brightestStar = indices[0];
	let brightestMag = apparentMag[indices[0]];
	for (let i = 1; i < indices.length; i++) {
		const mag = apparentMag[indices[i]];
		if (mag < brightestMag) {
			brightestMag = mag;
			brightestStar = indices[i];
		}
	}

	// Leaf node if small enough or max depth reached
	if (indices.length <= MAX_LEAF_SIZE || depth >= MAX_DEPTH) {
		return { bounds, stars: indices, children: null, brightestStar, brightestMag };
	}

	// Split into octants
	const midX = (bounds.minX + bounds.maxX) / 2;
	const midY = (bounds.minY + bounds.maxY) / 2;
	const midZ = (bounds.minZ + bounds.maxZ) / 2;

	// Bin stars into octants
	const bins: number[][] = [[], [], [], [], [], [], [], []];

	for (let i = 0; i < indices.length; i++) {
		const idx = indices[i];
		const x = positions[idx * 3];
		const y = positions[idx * 3 + 1];
		const z = positions[idx * 3 + 2];

		const octant = (x >= midX ? 1 : 0) | (y >= midY ? 2 : 0) | (z >= midZ ? 4 : 0);
		bins[octant].push(idx);
	}

	const children: (OctreeNode | null)[] = new Array(8).fill(null);

	for (let o = 0; o < 8; o++) {
		if (bins[o].length === 0) continue;

		const childBounds: AABB = {
			minX: o & 1 ? midX : bounds.minX,
			minY: o & 2 ? midY : bounds.minY,
			minZ: o & 4 ? midZ : bounds.minZ,
			maxX: o & 1 ? bounds.maxX : midX,
			maxY: o & 2 ? bounds.maxY : midY,
			maxZ: o & 4 ? bounds.maxZ : midZ
		};

		children[o] = buildNode(catalog, new Uint32Array(bins[o]), childBounds, depth + 1);
	}

	return { bounds, stars: null, children, brightestStar, brightestMag };
}

/**
 * Query all stars within an axis-aligned bounding box.
 */
export function queryAABB(tree: StarOctree, query: AABB): number[] {
	const results: number[] = [];
	queryAABBNode(tree.root, tree.catalog.positions, query, results);
	return results;
}

function queryAABBNode(
	node: OctreeNode,
	positions: Float32Array,
	query: AABB,
	results: number[]
): void {
	// Skip if no overlap
	if (
		node.bounds.maxX < query.minX ||
		node.bounds.minX > query.maxX ||
		node.bounds.maxY < query.minY ||
		node.bounds.minY > query.maxY ||
		node.bounds.maxZ < query.minZ ||
		node.bounds.minZ > query.maxZ
	) {
		return;
	}

	// Leaf: test individual stars
	if (node.stars) {
		for (let i = 0; i < node.stars.length; i++) {
			const idx = node.stars[i];
			const x = positions[idx * 3];
			const y = positions[idx * 3 + 1];
			const z = positions[idx * 3 + 2];
			if (
				x >= query.minX &&
				x <= query.maxX &&
				y >= query.minY &&
				y <= query.maxY &&
				z >= query.minZ &&
				z <= query.maxZ
			) {
				results.push(idx);
			}
		}
		return;
	}

	// Internal: recurse into children
	if (node.children) {
		for (const child of node.children) {
			if (child) queryAABBNode(child, positions, query, results);
		}
	}
}

/**
 * Find the nearest star to a point.
 * @returns [starIndex, distanceSquared] or null if catalog is empty
 */
export function findNearest(
	tree: StarOctree,
	px: number,
	py: number,
	pz: number
): [number, number] | null {
	if (tree.catalog.count === 0) return null;

	let bestIndex = -1;
	let bestDistSq = Infinity;

	findNearestNode(tree.root, tree.catalog.positions, px, py, pz, {
		bestIndex,
		bestDistSq
	});

	// Re-run with mutable state
	const state = { bestIndex: -1, bestDistSq: Infinity };
	findNearestNode(tree.root, tree.catalog.positions, px, py, pz, state);

	if (state.bestIndex === -1) return null;
	return [state.bestIndex, state.bestDistSq];
}

function findNearestNode(
	node: OctreeNode,
	positions: Float32Array,
	px: number,
	py: number,
	pz: number,
	state: { bestIndex: number; bestDistSq: number }
): void {
	// Prune: minimum possible distance to this AABB
	const dx = Math.max(node.bounds.minX - px, 0, px - node.bounds.maxX);
	const dy = Math.max(node.bounds.minY - py, 0, py - node.bounds.maxY);
	const dz = Math.max(node.bounds.minZ - pz, 0, pz - node.bounds.maxZ);
	const minDistSq = dx * dx + dy * dy + dz * dz;

	if (minDistSq >= state.bestDistSq) return;

	// Leaf: test individual stars
	if (node.stars) {
		for (let i = 0; i < node.stars.length; i++) {
			const idx = node.stars[i];
			const sx = positions[idx * 3] - px;
			const sy = positions[idx * 3 + 1] - py;
			const sz = positions[idx * 3 + 2] - pz;
			const distSq = sx * sx + sy * sy + sz * sz;
			if (distSq < state.bestDistSq) {
				state.bestDistSq = distSq;
				state.bestIndex = idx;
			}
		}
		return;
	}

	// Internal: recurse into children (could optimize by sorting by distance)
	if (node.children) {
		for (const child of node.children) {
			if (child) findNearestNode(child, positions, px, py, pz, state);
		}
	}
}

/**
 * Get stars for LOD rendering: returns the brightest stars visible at a given detail level.
 * Stars are selected by traversing the octree to a depth proportional to the detail level.
 *
 * @param tree The octree
 * @param maxMagnitude Maximum apparent magnitude to include (e.g. 6.0 for naked-eye)
 * @param maxCount Maximum number of stars to return
 * @returns Array of star indices, brightest first
 */
export function getStarsForLOD(
	tree: StarOctree,
	maxMagnitude: number,
	maxCount: number
): number[] {
	const results: number[] = [];
	collectLODStars(tree.root, tree.catalog.apparentMag, maxMagnitude, results, maxCount);
	results.sort((a, b) => tree.catalog.apparentMag[a] - tree.catalog.apparentMag[b]);
	return results;
}

function collectLODStars(
	node: OctreeNode,
	magnitudes: Float32Array,
	maxMag: number,
	results: number[],
	maxCount: number
): void {
	if (results.length >= maxCount) return;

	// Skip subtrees where the brightest star is too dim
	if (node.brightestMag > maxMag) return;

	// Leaf: add qualifying stars
	if (node.stars) {
		for (let i = 0; i < node.stars.length; i++) {
			if (results.length >= maxCount) return;
			const idx = node.stars[i];
			if (magnitudes[idx] <= maxMag) {
				results.push(idx);
			}
		}
		return;
	}

	// Internal: recurse
	if (node.children) {
		for (const child of node.children) {
			if (child) collectLODStars(child, magnitudes, maxMag, results, maxCount);
		}
	}
}
