/**
 * Constellation line data loader.
 *
 * Loads pre-computed constellation stick figure data (line segments in parsecs,
 * J2000 equatorial) from static/data/constellations.json.
 */

/** A single constellation's data. */
export interface Constellation {
	/** IAU 3-letter abbreviation (e.g., "Ori"). */
	id: string;
	/** Full name (e.g., "Orion"). */
	name: string;
	/** Line segments: each is [x1, y1, z1, x2, y2, z2] in parsecs. */
	lines: number[][];
	/** Center position [x, y, z] in parsecs (for label placement). */
	center: [number, number, number];
}

/** Full constellation catalog. */
export interface ConstellationData {
	format_version: number;
	coordinate_system: string;
	constellation_count: number;
	total_line_segments: number;
	constellations: Constellation[];
}

/**
 * Load constellation data from the static data directory.
 * @param basePath - Base path for data files (default: '/data')
 */
export async function loadConstellations(basePath = '/data'): Promise<ConstellationData> {
	const response = await fetch(`${basePath}/constellations.json`);
	if (!response.ok) {
		throw new Error(`Failed to load constellation data: ${response.status}`);
	}
	return response.json() as Promise<ConstellationData>;
}
