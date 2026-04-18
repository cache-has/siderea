#!/usr/bin/env node
/**
 * Process downloaded source textures into multi-resolution LOD tiers
 * for the Siderea web application.
 *
 * Usage:  node scripts/process-textures.mjs
 *
 * Input:  data/textures-source/*.{jpg,png}  (from fetch-textures.mjs)
 * Output: static/textures/{128,512,2048}/*.webp
 *
 * Each source texture is resized to three LOD tiers:
 * - 128px  wide — distant viewing, loaded immediately
 * - 512px  wide — medium distance
 * - 2048px wide — close-up viewing
 *
 * Ring textures (1D strips) are resized by width only, preserving
 * their narrow height for radial UV mapping.
 *
 * Requires: sharp (npm install --save-dev sharp)
 */

import sharp from 'sharp';
import { readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(__dirname, '../data/textures-source');
const OUTPUT_BASE = resolve(__dirname, '../static/textures');

/** LOD tier widths in pixels. */
const LOD_TIERS = [128, 512, 2048];

/** Ring textures: resize width but keep height proportional (narrow strip). */
const RING_FILES = new Set(['saturn_ring_alpha.png']);

/** Files that need alpha channel preserved (output as WebP with alpha). */
const ALPHA_FILES = new Set(['saturn_ring_alpha.png']);

/**
 * Process a single source texture into all LOD tiers.
 */
async function processTexture(filename) {
	const sourcePath = resolve(SOURCE_DIR, filename);
	const name = basename(filename, extname(filename));
	const hasAlpha = ALPHA_FILES.has(filename);
	const isRing = RING_FILES.has(filename);

	const metadata = await sharp(sourcePath).metadata();
	const sourceWidth = metadata.width;
	const sourceHeight = metadata.height;

	console.log(`  ${filename}: ${sourceWidth}×${sourceHeight}`);

	for (const tierWidth of LOD_TIERS) {
		// Skip tiers larger than the source
		if (tierWidth > sourceWidth) {
			console.log(`    ${tierWidth}px — skipped (source is only ${sourceWidth}px wide)`);
			continue;
		}

		const tierDir = resolve(OUTPUT_BASE, String(tierWidth));
		mkdirSync(tierDir, { recursive: true });

		const outName = `${name}.webp`;
		const outPath = resolve(tierDir, outName);

		let pipeline = sharp(sourcePath);

		if (isRing) {
			// Ring textures: resize width, compute proportional height
			const scale = tierWidth / sourceWidth;
			const tierHeight = Math.max(1, Math.round(sourceHeight * scale));
			pipeline = pipeline.resize(tierWidth, tierHeight, { fit: 'fill' });
		} else {
			// Equirectangular maps: width determines resolution, height = width/2
			const tierHeight = Math.round(tierWidth / 2);
			pipeline = pipeline.resize(tierWidth, tierHeight, { fit: 'fill' });
		}

		if (hasAlpha) {
			pipeline = pipeline.webp({ quality: 90, alphaQuality: 95 });
		} else {
			pipeline = pipeline.webp({ quality: 85 });
		}

		await pipeline.toFile(outPath);
		const outSize = statSync(outPath).size;
		console.log(`    ${tierWidth}px → ${outName} (${Math.round(outSize / 1024)} KB)`);
	}
}

async function main() {
	if (!existsSync(SOURCE_DIR)) {
		console.error(`Source directory not found: ${SOURCE_DIR}`);
		console.error('Run "node scripts/fetch-textures.mjs" first to download textures.');
		process.exit(1);
	}

	const files = readdirSync(SOURCE_DIR).filter(
		(f) => /\.(jpg|jpeg|png|tif|tiff)$/i.test(f)
	);

	if (files.length === 0) {
		console.error('No texture files found in source directory.');
		process.exit(1);
	}

	console.log(`Processing ${files.length} textures into LOD tiers: ${LOD_TIERS.join(', ')}px\n`);

	// Ensure output directories exist
	for (const tier of LOD_TIERS) {
		mkdirSync(resolve(OUTPUT_BASE, String(tier)), { recursive: true });
	}

	for (const file of files) {
		await processTexture(file);
	}

	console.log('\nDone! Textures written to static/textures/{128,512,2048}/');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
