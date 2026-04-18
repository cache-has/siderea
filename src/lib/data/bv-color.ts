/**
 * B-V color index to RGB conversion for star rendering.
 *
 * Uses the Ballesteros (2012) formula to convert B-V → effective temperature,
 * then Planck blackbody → sRGB approximation.
 *
 * Reference: Ballesteros, F.J. (2012). "New insights into black bodies."
 * EPL 97, 34008. doi:10.1209/0295-5075/97/34008
 */

import type { RGB } from './types';

// B-V quantization parameters (must match process-hyg.py)
const BV_MIN = -0.5;
const BV_MAX = 2.5;
const BV_RANGE = BV_MAX - BV_MIN;

/** Pre-computed lookup table: 256 entries mapping quantized B-V → [r, g, b] as uint8. */
let colorLUT: Uint8Array | null = null;

/**
 * Convert B-V color index to effective temperature in Kelvin.
 * Ballesteros (2012) formula.
 */
function bvToTemperature(bv: number): number {
	return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/**
 * Convert color temperature (K) to linear RGB [0,1].
 * Attempt at a polynomial approximation of the CIE 1931 XYZ to sRGB path,
 * based on Tanner Helland's approximation (widely used in graphics).
 *
 * Source: https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm.html
 */
function temperatureToRGB(tempK: number): RGB {
	const temp = tempK / 100;
	let r: number, g: number, b: number;

	// Red
	if (temp <= 66) {
		r = 1.0;
	} else {
		r = 1.292936186 * Math.pow(temp - 60, -0.1332047592);
	}

	// Green
	if (temp <= 66) {
		g = 0.3900815788 * Math.log(temp) - 0.6318414438;
	} else {
		g = 1.129890861 * Math.pow(temp - 60, -0.0755148492);
	}

	// Blue
	if (temp >= 66) {
		b = 1.0;
	} else if (temp <= 19) {
		b = 0.0;
	} else {
		b = 0.5432067891 * Math.log(temp - 10) - 1.19625409;
	}

	return [
		Math.max(0, Math.min(1, r)),
		Math.max(0, Math.min(1, g)),
		Math.max(0, Math.min(1, b))
	];
}

/**
 * Convert a B-V color index to an RGB color.
 * @param bv B-V color index (typically -0.4 to 2.0)
 * @returns RGB tuple in [0, 1] range
 */
export function bvToRGB(bv: number): RGB {
	const temp = bvToTemperature(bv);
	return temperatureToRGB(temp);
}

/**
 * Dequantize a uint8 color index back to B-V value.
 */
export function dequantizeBV(quantized: number): number {
	return (quantized / 255) * BV_RANGE + BV_MIN;
}

/**
 * Get or build the 256-entry color lookup table.
 * Returns a Uint8Array of length 768 (256 × RGB).
 * Can be uploaded to GPU as a 256×1 RGB texture for shader-based color lookup.
 */
export function getColorLUT(): Uint8Array {
	if (colorLUT) return colorLUT;

	colorLUT = new Uint8Array(256 * 3);
	for (let i = 0; i < 256; i++) {
		const bv = dequantizeBV(i);
		const [r, g, b] = bvToRGB(bv);
		colorLUT[i * 3] = Math.round(r * 255);
		colorLUT[i * 3 + 1] = Math.round(g * 255);
		colorLUT[i * 3 + 2] = Math.round(b * 255);
	}
	return colorLUT;
}
