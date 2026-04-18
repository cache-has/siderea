import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StarCatalogData, StarCatalogMeta } from './types';

// We test the binary parsing logic directly since we can't use fetch in Node.
// This mirrors the parseBinary function from star-catalog.ts.

const MAGIC = 0x52444953;
const HEADER_SIZE = 20;

const testDir = fileURLToPath(new URL('.', import.meta.url));
const binPath = resolve(testDir, '../../../static/data/stars.bin');
const metaPath = resolve(testDir, '../../../static/data/stars-meta.json');

function parseBinaryForTest(buffer: ArrayBuffer): StarCatalogData {
	const view = new DataView(buffer);
	const magic = view.getUint32(0, true);
	expect(magic).toBe(MAGIC);

	const version = view.getUint32(4, true);
	expect(version).toBe(1);

	const count = view.getUint32(8, true);

	let offset = HEADER_SIZE;
	const positions = new Float32Array(buffer, offset, count * 3);
	offset += count * 3 * 4;

	const apparentMag = new Float32Array(buffer, offset, count);
	offset += count * 4;

	const absoluteMag = new Float32Array(buffer, offset, count);
	offset += count * 4;

	const colorIndex = new Uint8Array(buffer, offset, count);
	offset += count;

	// Align to 4-byte boundary after uint8 array
	offset = (offset + 3) & ~3;

	const pmRA = new Float32Array(buffer, offset, count);
	offset += count * 4;

	const pmDec = new Float32Array(buffer, offset, count);

	return { count, positions, apparentMag, absoluteMag, colorIndex, pmRA, pmDec };
}

function loadTestData(): { buffer: ArrayBuffer | null; meta: StarCatalogMeta | null } {
	try {
		const binBuf = readFileSync(binPath);
		const buffer = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength);
		const meta: StarCatalogMeta = JSON.parse(readFileSync(metaPath, 'utf-8'));
		return { buffer, meta };
	} catch {
		return { buffer: null, meta: null };
	}
}

const { buffer, meta } = loadTestData();

describe('star-catalog binary', () => {
	it('parses the binary catalog header', () => {
		if (!buffer) return;
		const data = parseBinaryForTest(buffer);
		expect(data.count).toBeGreaterThan(100000);
		expect(data.count).toBeLessThan(200000);
	});

	it('has valid position data', () => {
		if (!buffer) return;
		const data = parseBinaryForTest(buffer);
		expect(Number.isFinite(data.positions[0])).toBe(true);
		expect(Number.isFinite(data.positions[1])).toBe(true);
		expect(Number.isFinite(data.positions[2])).toBe(true);
	});

	it('has reasonable magnitude range', () => {
		if (!buffer) return;
		const data = parseBinaryForTest(buffer);
		let minMag = Infinity;
		let maxMag = -Infinity;
		for (let i = 0; i < Math.min(data.count, 10000); i++) {
			const m = data.apparentMag[i];
			if (m < minMag) minMag = m;
			if (m > maxMag) maxMag = m;
		}
		// Sirius is ~-1.46, faintest stars ~20
		expect(minMag).toBeLessThan(0);
		expect(maxMag).toBeGreaterThan(5);
	});

	it('has notable stars in metadata', () => {
		if (!meta) return;
		expect(meta.stars.length).toBeGreaterThan(400);
		const sirius = meta.stars.find((s) => s.name === 'Sirius');
		expect(sirius).toBeDefined();
		expect(sirius!.mag).toBeCloseTo(-1.46, 1);
	});

	it('metadata count matches binary count', () => {
		if (!buffer || !meta) return;
		const data = parseBinaryForTest(buffer);
		expect(meta.total_stars).toBe(data.count);
	});
});
