#!/usr/bin/env node
/**
 * Fetch current TLE data from CelesTrak for tracked satellites and write
 * a JSON snapshot to static/data/tle-snapshot.json.
 *
 * Usage:  node scripts/fetch-tle.mjs
 *
 * The snapshot contains TLE lines keyed by NORAD catalog ID and is loaded
 * by the satellite renderer as the baked offline fallback.
 *
 * Source: CelesTrak GP Data API (https://celestrak.org/NORAD/elements/gp.php)
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// NORAD catalog IDs for satellites with orbit_type "tle" in solar-system.json
const NORAD_IDS = [25544, 20580, 25867]; // ISS, Hubble, Chandra

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const OUTPUT_PATH = resolve(__dirname, '../static/data/tle-snapshot.json');

/**
 * Fetch 3LE (name + two TLE lines) for a single NORAD ID.
 * Returns { name, line1, line2 } or throws on failure.
 */
async function fetchTle(noradId) {
	const url = `${CELESTRAK_BASE}?CATNR=${noradId}&FORMAT=3LE`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`CelesTrak returned ${res.status} for NORAD ${noradId}`);
	}
	const text = (await res.text()).trim();
	const lines = text.split(/\r?\n/).map((l) => l.trimEnd());

	if (lines.length < 3 || !lines[1].startsWith('1 ') || !lines[2].startsWith('2 ')) {
		throw new Error(`Unexpected 3LE format for NORAD ${noradId}: ${text.slice(0, 120)}`);
	}

	return {
		name: lines[0].trim(),
		line1: lines[1],
		line2: lines[2]
	};
}

async function main() {
	console.log('Fetching TLE data from CelesTrak...');

	const snapshot = {
		fetchedAt: new Date().toISOString(),
		tles: {}
	};

	for (const noradId of NORAD_IDS) {
		try {
			const tle = await fetchTle(noradId);
			snapshot.tles[noradId] = tle;

			// Extract epoch from line 1 (columns 19-32) for display
			const epochStr = tle.line1.substring(18, 32).trim();
			console.log(`  OK: ${tle.name} (NORAD ${noradId}) epoch ${epochStr}`);
		} catch (err) {
			console.error(`  ERROR: NORAD ${noradId}: ${err.message}`);
		}
	}

	const count = Object.keys(snapshot.tles).length;
	if (count === 0) {
		console.error('No TLEs fetched — snapshot NOT written.');
		process.exit(1);
	}

	writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
	console.log(`\nWrote ${count} TLE(s) to ${OUTPUT_PATH}`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
