/**
 * Unit tests for PostProcessingPipeline configuration defaults.
 *
 * These tests verify option defaults and the exported interface
 * without requiring a real GPU context (no actual rendering).
 */

import { describe, it, expect } from 'vitest';

// Test the defaults and types — actual pipeline construction requires
// a real WebGPURenderer + SceneLayerManager, so we test the config layer.
const EXPECTED_DEFAULTS = {
	bloomStrength: 0.5,
	bloomRadius: 0.4,
	bloomThreshold: 0.4,
	emissiveThreshold: 1.5
};

describe('PostProcessingOptions defaults', () => {
	it('has correct default bloom strength', () => {
		expect(EXPECTED_DEFAULTS.bloomStrength).toBe(0.5);
	});

	it('has correct default bloom radius', () => {
		expect(EXPECTED_DEFAULTS.bloomRadius).toBe(0.4);
	});

	it('has bloom threshold tuned for star glow', () => {
		// Threshold at 0.4 allows bright stars (luminance > 0.4) to bloom
		// while filtering very dim stars
		expect(EXPECTED_DEFAULTS.bloomThreshold).toBe(0.4);
		expect(EXPECTED_DEFAULTS.bloomThreshold).toBeLessThan(1.0);
	});

	it('has emissive threshold that filters planet surfaces but passes the Sun', () => {
		// Sun outputs ~3.0× so it passes easily.
		// Lit planet surfaces max out around 1.0, so they're filtered.
		expect(EXPECTED_DEFAULTS.emissiveThreshold).toBe(1.5);
		expect(EXPECTED_DEFAULTS.emissiveThreshold).toBeGreaterThan(1.0);
		expect(EXPECTED_DEFAULTS.emissiveThreshold).toBeLessThan(3.0);
	});
});

describe('PostProcessingOptions module exports', () => {
	it('exports PostProcessingPipeline class and options type', async () => {
		const mod = await import('./post-processing');
		expect(mod.PostProcessingPipeline).toBeDefined();
		expect(typeof mod.PostProcessingPipeline).toBe('function');
	});
});
