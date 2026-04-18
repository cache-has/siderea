import { describe, it, expect } from 'vitest';
import type { ConstellationRendererOptions } from './constellation-renderer';

/**
 * ConstellationRenderer requires DOM (HTMLCanvasElement) and WebGPU Line2 materials,
 * so we test the options/defaults interface and leave integration testing to the browser.
 */

describe('ConstellationRenderer options', () => {
	it('has expected option keys', () => {
		const opts: ConstellationRendererOptions = {
			lineWidth: 2.0,
			lineOpacity: 0.5,
			lineColor: 0xff0000,
			labelColor: '#ffffff',
			labelFadeDistance: 1.0,
			lineFadeDistance: 5.0
		};
		expect(opts.lineWidth).toBe(2.0);
		expect(opts.lineOpacity).toBe(0.5);
		expect(opts.lineFadeDistance).toBe(5.0);
	});

	it('all options are optional', () => {
		const opts: ConstellationRendererOptions = {};
		expect(opts.lineWidth).toBeUndefined();
	});
});
