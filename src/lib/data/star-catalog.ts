/**
 * Star catalog loader and query interface.
 *
 * Loads the binary star catalog (stars.bin) and notable star metadata (stars-meta.json)
 * produced by scripts/process-hyg.py.
 *
 * Binary format (little-endian):
 *   Header:     20 bytes (magic "SIDR", version, count, notable_count, reserved)
 *   Positions:  float32[count * 3]  — x, y, z in parsecs (J2000 equatorial)
 *   AppMag:     float32[count]
 *   AbsMag:     float32[count]
 *   ColorIndex: uint8[count]        — quantized B-V
 *   Padding:    0-3 bytes           — align to 4-byte boundary
 *   PMRA:       float32[count]      — proper motion RA (mas/yr)
 *   PMDec:      float32[count]      — proper motion Dec (mas/yr)
 */

import type { StarCatalogData, StarCatalogMeta, NotableStar } from './types';

const MAGIC = 0x52444953; // "SIDR" as uint32 LE
const SUPPORTED_VERSION = 1;
const HEADER_SIZE = 20;

/** Parsed and ready-to-use star catalog. */
export interface StarCatalog {
	/** GPU-ready typed arrays. */
	data: StarCatalogData;
	/** Notable star metadata with names and designations. */
	notable: NotableStar[];
	/** Map from star name (lowercase) to NotableStar for search. */
	nameIndex: Map<string, NotableStar>;
	/** Total number of stars. */
	count: number;
}

/**
 * Parse the binary star catalog from an ArrayBuffer.
 */
function parseBinary(buffer: ArrayBuffer): StarCatalogData {
	const view = new DataView(buffer);

	// Validate header
	const magic = view.getUint32(0, true);
	if (magic !== MAGIC) {
		throw new Error(`Invalid star catalog magic: 0x${magic.toString(16)} (expected 0x${MAGIC.toString(16)})`);
	}

	const version = view.getUint32(4, true);
	if (version !== SUPPORTED_VERSION) {
		throw new Error(`Unsupported star catalog version: ${version} (expected ${SUPPORTED_VERSION})`);
	}

	const count = view.getUint32(8, true);

	// Compute offsets into the buffer
	let offset = HEADER_SIZE;

	const posBytes = count * 3 * 4;
	const positions = new Float32Array(buffer, offset, count * 3);
	offset += posBytes;

	const magBytes = count * 4;
	const apparentMag = new Float32Array(buffer, offset, count);
	offset += magBytes;

	const absoluteMag = new Float32Array(buffer, offset, count);
	offset += magBytes;

	const colorIndex = new Uint8Array(buffer, offset, count);
	offset += count;

	// Align to 4-byte boundary after uint8 array
	offset = (offset + 3) & ~3;

	const pmRA = new Float32Array(buffer, offset, count);
	offset += magBytes;

	const pmDec = new Float32Array(buffer, offset, count);

	return { count, positions, apparentMag, absoluteMag, colorIndex, pmRA, pmDec };
}

/**
 * Build a name lookup index from notable stars.
 */
function buildNameIndex(notable: NotableStar[]): Map<string, NotableStar> {
	const index = new Map<string, NotableStar>();
	for (const star of notable) {
		index.set(star.name.toLowerCase(), star);
		if (star.bayer) {
			index.set(star.bayer.toLowerCase(), star);
		}
	}
	return index;
}

/**
 * Load the star catalog from the static data directory.
 *
 * @param basePath Base URL path to the data directory (default: "/data")
 * @returns Loaded and indexed star catalog
 */
export async function loadStarCatalog(basePath = '/data'): Promise<StarCatalog> {
	const [binResponse, metaResponse] = await Promise.all([
		fetch(`${basePath}/stars.bin`),
		fetch(`${basePath}/stars-meta.json`)
	]);

	if (!binResponse.ok) {
		throw new Error(`Failed to load stars.bin: ${binResponse.status} ${binResponse.statusText}`);
	}
	if (!metaResponse.ok) {
		throw new Error(`Failed to load stars-meta.json: ${metaResponse.status} ${metaResponse.statusText}`);
	}

	const [buffer, meta] = await Promise.all([
		binResponse.arrayBuffer(),
		metaResponse.json() as Promise<StarCatalogMeta>
	]);

	const data = parseBinary(buffer);
	const notable = meta.stars;
	const nameIndex = buildNameIndex(notable);

	return { data, notable, nameIndex, count: data.count };
}

/**
 * Get the position of a star by index.
 * @returns [x, y, z] in parsecs
 */
export function getStarPosition(catalog: StarCatalog, index: number): [number, number, number] {
	const i = index * 3;
	return [
		catalog.data.positions[i],
		catalog.data.positions[i + 1],
		catalog.data.positions[i + 2]
	];
}

/**
 * Search for stars by name prefix (case-insensitive).
 * Returns up to `limit` matching notable stars.
 */
export function searchStarsByName(catalog: StarCatalog, query: string, limit = 10): NotableStar[] {
	const q = query.toLowerCase();
	const results: NotableStar[] = [];

	for (const star of catalog.notable) {
		if (results.length >= limit) break;
		if (
			star.name.toLowerCase().startsWith(q) ||
			(star.bayer && star.bayer.toLowerCase().includes(q)) ||
			(star.constellation && star.constellation.toLowerCase() === q)
		) {
			results.push(star);
		}
	}

	return results;
}

/**
 * Get stars brighter than a given apparent magnitude.
 * Returns indices sorted by brightness (brightest first).
 */
export function getStarsBrighterThan(catalog: StarCatalog, maxMag: number): number[] {
	const indices: number[] = [];
	const mag = catalog.data.apparentMag;

	for (let i = 0; i < catalog.count; i++) {
		if (mag[i] <= maxMag) {
			indices.push(i);
		}
	}

	indices.sort((a, b) => mag[a] - mag[b]);
	return indices;
}
