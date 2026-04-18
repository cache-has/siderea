import { describe, it, expect } from 'vitest';
import { bvToRGB, dequantizeBV, getColorLUT } from './bv-color';

describe('bv-color', () => {
	it('maps Sun-like B-V (0.65) to yellowish color', () => {
		const [r, g, b] = bvToRGB(0.65);
		// Sun should be warm white/yellow: R > G > B
		expect(r).toBeGreaterThan(0.8);
		expect(g).toBeGreaterThan(0.6);
		expect(b).toBeLessThan(g);
	});

	it('maps hot blue star (B-V = -0.3) to blue-white', () => {
		const [r, g, b] = bvToRGB(-0.3);
		// Blue stars: B should be high
		expect(b).toBeGreaterThan(0.5);
		expect(r).toBeLessThanOrEqual(1.0);
	});

	it('maps cool red star (B-V = 1.5) to reddish', () => {
		const [r, g, b] = bvToRGB(1.5);
		// Red stars: R > G > B
		expect(r).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(b);
	});

	it('dequantizeBV round-trips within tolerance', () => {
		const bv = 0.65;
		const quantized = Math.round(((bv - (-0.5)) / 3.0) * 255);
		const recovered = dequantizeBV(quantized);
		expect(recovered).toBeCloseTo(bv, 1);
	});

	it('getColorLUT returns 768-byte table', () => {
		const lut = getColorLUT();
		expect(lut).toBeInstanceOf(Uint8Array);
		expect(lut.length).toBe(256 * 3);
		// First entry (B-V = -0.5, very hot) should have high blue
		expect(lut[2]).toBeGreaterThan(100); // blue channel
	});
});
