/**
 * Spectral type parsing and stellar property estimation.
 *
 * Parses MK spectral classification strings (e.g. "A1V", "K0III", "G2IV-V")
 * to extract spectral class, subclass, and luminosity class.
 *
 * Provides approximate mass, radius, and temperature estimates from spectral type,
 * suitable for info panel display. These are rough main-sequence or evolved-star
 * estimates — not precise astrophysical measurements.
 */

/** Parsed spectral classification. */
export interface SpectralInfo {
	/** Spectral class letter (O, B, A, F, G, K, M). */
	spectralClass: string;
	/** Numeric subclass (0-9, may be fractional). */
	subclass: number;
	/** Luminosity class string (e.g. "V", "III", "Ia"). */
	luminosityClass: string;
	/** Human-readable luminosity description. */
	luminosityLabel: string;
}

/** Estimated stellar properties from spectral type. */
export interface StellarEstimates {
	/** Effective temperature in Kelvin. */
	temperature_K: number;
	/** Mass in solar masses (approximate). */
	mass_solar: number;
	/** Radius in solar radii (approximate). */
	radius_solar: number;
}

const LUMINOSITY_LABELS: Record<string, string> = {
	'Ia-0': 'Extreme supergiant',
	'Ia': 'Luminous supergiant',
	'Iab': 'Intermediate supergiant',
	'Ib': 'Less luminous supergiant',
	'I': 'Supergiant',
	'II': 'Bright giant',
	'III': 'Giant',
	'IV': 'Subgiant',
	'V': 'Main sequence',
	'VI': 'Subdwarf',
	'VII': 'White dwarf'
};

/**
 * Parse a spectral type string into components.
 * Handles formats like: "A1V", "K0III-IV", "G2V", "B9p", "M1.5V", "F2III-IV"
 */
export function parseSpectralType(spectral: string): SpectralInfo | null {
	if (!spectral || spectral.length === 0) return null;

	// Match: spectral class letter, optional subclass digits, optional luminosity
	// Order matters: IV before III/II/I, VII before VI before V
	const match = spectral.match(
		/^([OBAFGKM])(\d+\.?\d*)\s*(Ia-0|Iab|Ia|Ib|IV|III|II|I|VII|VI|V)?/i
	);

	if (!match) return null;

	const spectralClass = match[1].toUpperCase();
	const subclass = parseFloat(match[2]) || 0;
	let luminosityClass = (match[3] || 'V').replace(/\s/g, '');

	// Normalize common patterns
	if (luminosityClass === 'I' && !spectral.includes('II') && !spectral.includes('IV')) {
		luminosityClass = 'I';
	}

	const luminosityLabel = LUMINOSITY_LABELS[luminosityClass] || luminosityClass;

	return { spectralClass, subclass, luminosityClass, luminosityLabel };
}

/**
 * Main-sequence temperature estimates by spectral type.
 * Source: Pecaut & Mamajek (2013), updated 2022.
 * Maps spectral class + subclass → temperature_K.
 */
const MS_TEMP: Record<string, number[]> = {
	// O0-O9 (indices 0-9, only O3-O9 well-defined)
	'O': [50000, 48000, 45000, 44500, 43000, 41500, 39500, 37000, 35000, 33000],
	// B0-B9
	'B': [31500, 26000, 20600, 17000, 16400, 15700, 14500, 13000, 11800, 10700],
	// A0-A9
	'A': [9700, 9300, 8800, 8600, 8250, 8100, 7910, 7760, 7590, 7400],
	// F0-F9
	'F': [7220, 7030, 6810, 6720, 6640, 6510, 6340, 6240, 6150, 6040],
	// G0-G9
	'G': [5920, 5880, 5770, 5720, 5680, 5660, 5600, 5500, 5430, 5340],
	// K0-K9
	'K': [5280, 5170, 5040, 4840, 4620, 4450, 4200, 4050, 3940, 3870],
	// M0-M9
	'M': [3850, 3700, 3550, 3400, 3200, 3050, 2800, 2650, 2500, 2400]
};

/** Main-sequence mass estimates (solar masses) by spectral type. */
const MS_MASS: Record<string, number[]> = {
	'O': [120, 100, 80, 60, 40, 35, 30, 25, 20, 17],
	'B': [15, 11, 7.5, 5.9, 5.2, 4.5, 3.8, 3.4, 3.0, 2.7],
	'A': [2.5, 2.3, 2.1, 2.0, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4],
	'F': [1.35, 1.30, 1.25, 1.21, 1.18, 1.15, 1.10, 1.08, 1.06, 1.04],
	'G': [1.02, 1.00, 0.98, 0.96, 0.94, 0.92, 0.90, 0.88, 0.86, 0.84],
	'K': [0.82, 0.79, 0.75, 0.72, 0.69, 0.66, 0.62, 0.58, 0.55, 0.52],
	'M': [0.49, 0.44, 0.38, 0.33, 0.26, 0.21, 0.16, 0.12, 0.10, 0.08]
};

/** Main-sequence radius estimates (solar radii) by spectral type. */
const MS_RADIUS: Record<string, number[]> = {
	'O': [15, 13, 12, 10, 8.5, 7.5, 6.5, 6.0, 5.5, 5.0],
	'B': [4.8, 4.0, 3.2, 2.8, 2.6, 2.4, 2.2, 2.0, 1.8, 1.7],
	'A': [1.6, 1.55, 1.5, 1.47, 1.44, 1.41, 1.38, 1.35, 1.32, 1.3],
	'F': [1.28, 1.26, 1.24, 1.22, 1.20, 1.17, 1.14, 1.12, 1.10, 1.08],
	'G': [1.06, 1.03, 1.01, 0.99, 0.97, 0.95, 0.93, 0.91, 0.89, 0.87],
	'K': [0.85, 0.82, 0.79, 0.76, 0.73, 0.70, 0.67, 0.63, 0.60, 0.57],
	'M': [0.54, 0.48, 0.42, 0.37, 0.30, 0.25, 0.19, 0.15, 0.12, 0.10]
};

/**
 * Estimate stellar properties from a spectral type string.
 * Returns main-sequence estimates; giants/supergiants will be approximate.
 */
export function estimateStellarProperties(spectral: string): StellarEstimates | null {
	const info = parseSpectralType(spectral);
	if (!info) return null;

	const { spectralClass, subclass, luminosityClass } = info;

	const temps = MS_TEMP[spectralClass];
	const masses = MS_MASS[spectralClass];
	const radii = MS_RADIUS[spectralClass];
	if (!temps || !masses || !radii) return null;

	// Interpolate between subclass entries
	const idx = Math.min(Math.floor(subclass), 8);
	const frac = subclass - idx;
	const temperature_K = Math.round(temps[idx] + (temps[idx + 1] - temps[idx]) * frac);
	let mass_solar = masses[idx] + (masses[idx + 1] - masses[idx]) * frac;
	let radius_solar = radii[idx] + (radii[idx + 1] - radii[idx]) * frac;

	// Rough luminosity class adjustments for non-main-sequence stars
	if (luminosityClass === 'III') {
		// Giants: ~10× radius, similar mass
		radius_solar *= 10;
	} else if (luminosityClass === 'II') {
		radius_solar *= 25;
	} else if (luminosityClass.startsWith('I') && luminosityClass !== 'IV') {
		// Supergiants: ~100× radius, higher mass
		radius_solar *= 100;
		mass_solar *= 2;
	} else if (luminosityClass === 'IV') {
		// Subgiants: ~2× radius
		radius_solar *= 2;
	} else if (luminosityClass === 'VI') {
		// Subdwarfs: ~0.7× radius
		radius_solar *= 0.7;
	}

	return {
		temperature_K,
		mass_solar: Math.round(mass_solar * 100) / 100,
		radius_solar: Math.round(radius_solar * 100) / 100
	};
}

/**
 * Estimate temperature from B-V color index using Ballesteros (2012).
 * More reliable than spectral type parsing for individual stars.
 */
export function bvToTemperature(bv: number): number {
	return Math.round(4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)));
}

/**
 * Format a distance in parsecs to a human-readable string.
 */
export function formatDistance(distPc: number): string {
	if (distPc <= 0) return 'N/A';
	const ly = distPc * 3.26156;
	if (distPc < 1) {
		return `${(distPc * 1000).toFixed(0)} mpc (${ly.toFixed(2)} ly)`;
	}
	if (distPc < 100) {
		return `${distPc.toFixed(1)} pc (${ly.toFixed(1)} ly)`;
	}
	return `${distPc.toFixed(0)} pc (${ly.toFixed(0)} ly)`;
}
