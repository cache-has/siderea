#!/usr/bin/env node
/**
 * Download high-quality planet/moon texture maps from public domain and
 * CC BY 4.0 sources. Saves originals to data/textures-source/.
 *
 * Usage:  node scripts/fetch-textures.mjs
 *
 * After downloading, run:  node scripts/process-textures.mjs
 * to generate multi-resolution LOD tiers for the app.
 *
 * Sources:
 * - NASA SVS CGI Moon Kit (public domain)
 * - NASA Blue Marble Next Generation (public domain)
 * - Solar System Scope (CC BY 4.0, https://www.solarsystemscope.com/textures/)
 * - Steve Albers / NASA data (public domain)
 */

import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../data/textures-source');

/**
 * Texture manifest: NAIF ID → download info.
 *
 * Priority order per body:
 * 1. NASA/USGS public domain (highest quality, no attribution required)
 * 2. Steve Albers compilations (NASA data, public domain)
 * 3. Solar System Scope (CC BY 4.0, requires attribution)
 */
const TEXTURE_MANIFEST = [
	// --- Sun ---
	{
		id: 'sun',
		naifId: 10,
		filename: 'sun.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_sun.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_sun.jpg'
		],
		source: 'Solar System Scope',
		license: 'CC BY 4.0'
	},

	// --- Mercury ---
	{
		id: 'mercury',
		naifId: 1,
		filename: 'mercury.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_mercury.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_mercury.jpg'
		],
		source: 'Solar System Scope (MESSENGER data)',
		license: 'CC BY 4.0'
	},

	// --- Venus (atmosphere — surface is radar-only) ---
	{
		id: 'venus',
		naifId: 2,
		filename: 'venus_atmosphere.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/4k_venus_atmosphere.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg'
		],
		source: 'Solar System Scope',
		license: 'CC BY 4.0'
	},

	// --- Earth (day map) ---
	{
		id: 'earth',
		naifId: 3,
		filename: 'earth_daymap.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg'
		],
		source: 'Solar System Scope (NASA Blue Marble data)',
		license: 'CC BY 4.0'
	},

	// --- Earth night lights ---
	{
		id: 'earth_night',
		naifId: 3,
		filename: 'earth_nightmap.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_earth_nightmap.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg'
		],
		source: 'Solar System Scope (NASA data)',
		license: 'CC BY 4.0'
	},

	// --- Earth clouds ---
	{
		id: 'earth_clouds',
		naifId: 3,
		filename: 'earth_clouds.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg'
		],
		source: 'Solar System Scope (NASA data)',
		license: 'CC BY 4.0'
	},

	// --- Moon (NASA SVS CGI Moon Kit — best available) ---
	{
		id: 'moon',
		naifId: 301,
		filename: 'moon.jpg',
		urls: [
			'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg'
		],
		source: 'NASA SVS CGI Moon Kit (LROC data)',
		license: 'Public Domain (NASA)'
	},

	// --- Mars ---
	{
		id: 'mars',
		naifId: 4,
		filename: 'mars.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_mars.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_mars.jpg'
		],
		source: 'Solar System Scope (Viking/MRO data)',
		license: 'CC BY 4.0'
	},

	// --- Jupiter ---
	{
		id: 'jupiter',
		naifId: 5,
		filename: 'jupiter.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_jupiter.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg'
		],
		source: 'Solar System Scope (Cassini/Juno data)',
		license: 'CC BY 4.0'
	},

	// --- Saturn ---
	{
		id: 'saturn',
		naifId: 6,
		filename: 'saturn.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_saturn.jpg',
			'https://www.solarsystemscope.com/textures/download/2k_saturn.jpg'
		],
		source: 'Solar System Scope (Cassini data)',
		license: 'CC BY 4.0'
	},

	// --- Saturn rings (with alpha transparency) ---
	{
		id: 'saturn_ring',
		naifId: 6,
		filename: 'saturn_ring_alpha.png',
		urls: [
			'https://www.solarsystemscope.com/textures/download/8k_saturn_ring_alpha.png',
			'https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png'
		],
		source: 'Solar System Scope',
		license: 'CC BY 4.0',
		isRing: true
	},

	// --- Uranus ---
	{
		id: 'uranus',
		naifId: 7,
		filename: 'uranus.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/2k_uranus.jpg'
		],
		source: 'Solar System Scope (Voyager 2 data)',
		license: 'CC BY 4.0'
	},

	// --- Neptune ---
	{
		id: 'neptune',
		naifId: 8,
		filename: 'neptune.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg'
		],
		source: 'Solar System Scope (Voyager 2 data)',
		license: 'CC BY 4.0'
	},

	// --- Pluto (Steve Albers, New Horizons data) ---
	{
		id: 'pluto',
		naifId: 9,
		filename: 'pluto.jpg',
		urls: [
			'https://stevealbers.net/albers/sos/pluto/pluto_rgb_cyl_8k.jpg',
			'https://www.solarsystemscope.com/textures/download/4k_makemake_fictional.jpg' // fallback
		],
		source: 'Steve Albers (NASA New Horizons data)',
		license: 'Public Domain (NASA)'
	},

	// --- Ceres ---
	{
		id: 'ceres',
		naifId: 10,
		filename: 'ceres.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/4k_ceres_fictional.jpg'
		],
		source: 'Solar System Scope (artistic, Dawn data reference)',
		license: 'CC BY 4.0',
		note: 'Artistic interpretation — no true-color global map exists at usable resolution'
	},

	// --- Eris (fictional — no spacecraft visit) ---
	{
		id: 'eris',
		naifId: 11,
		filename: 'eris.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/4k_eris_fictional.jpg'
		],
		source: 'Solar System Scope (artistic)',
		license: 'CC BY 4.0',
		note: 'Fictional — no spacecraft has visited Eris'
	},

	// --- Haumea (fictional — no spacecraft visit) ---
	{
		id: 'haumea',
		naifId: 12,
		filename: 'haumea.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/4k_haumea_fictional.jpg'
		],
		source: 'Solar System Scope (artistic)',
		license: 'CC BY 4.0',
		note: 'Fictional — no spacecraft has visited Haumea'
	},

	// --- Makemake (fictional — no spacecraft visit) ---
	{
		id: 'makemake',
		naifId: 13,
		filename: 'makemake.jpg',
		urls: [
			'https://www.solarsystemscope.com/textures/download/4k_makemake_fictional.jpg'
		],
		source: 'Solar System Scope (artistic)',
		license: 'CC BY 4.0',
		note: 'Fictional — no spacecraft has visited Makemake'
	}
];

/**
 * Download a file with retry and fallback URL support.
 */
async function downloadFile(urls, outputPath) {
	for (const url of urls) {
		try {
			console.log(`  Trying: ${url}`);
			const res = await fetch(url, {
				headers: { 'User-Agent': 'Siderea/1.0 (planet texture downloader)' },
				redirect: 'follow'
			});

			if (!res.ok) {
				console.warn(`  HTTP ${res.status} — trying next URL...`);
				continue;
			}

			const fileStream = createWriteStream(outputPath);
			await pipeline(Readable.fromWeb(res.body), fileStream);

			const sizeKB = Math.round(fileStream.bytesWritten / 1024);
			console.log(`  ✓ Downloaded (${sizeKB} KB)`);
			return true;
		} catch (err) {
			console.warn(`  Failed: ${err.message} — trying next URL...`);
		}
	}
	return false;
}

async function main() {
	mkdirSync(OUTPUT_DIR, { recursive: true });

	console.log(`Downloading texture sources to ${OUTPUT_DIR}\n`);

	let downloaded = 0;
	let skipped = 0;
	let failed = 0;

	for (const entry of TEXTURE_MANIFEST) {
		const outputPath = resolve(OUTPUT_DIR, entry.filename);

		if (existsSync(outputPath)) {
			console.log(`[skip] ${entry.id} — already exists`);
			skipped++;
			continue;
		}

		console.log(`[${entry.id}] Downloading...`);
		const ok = await downloadFile(entry.urls, outputPath);
		if (ok) {
			downloaded++;
		} else {
			console.error(`  ✗ FAILED: ${entry.id} — no working URL`);
			failed++;
		}
	}

	console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);

	if (failed > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
