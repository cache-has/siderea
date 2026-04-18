import { describe, it, expect } from 'vitest';
import {
	QUALITY_PRESETS,
	LABEL_DENSITY_CONFIGS,
	type QualityPreset,
	type LabelDensity,
	type SettingsValues,
} from './settings-state.svelte';

describe('QUALITY_PRESETS', () => {
	it('has all four presets', () => {
		const keys: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];
		for (const k of keys) {
			const p = QUALITY_PRESETS[k];
			expect(p.pixelRatioMax).toBeGreaterThan(0);
			expect(p.bloomStrength).toBeGreaterThanOrEqual(0);
			expect(p.bloomRadius).toBeGreaterThan(0);
			expect(p.starLabelMaxLabels).toBeGreaterThan(0);
		}
	});

	it('higher presets have higher pixel ratio caps', () => {
		expect(QUALITY_PRESETS.ultra.pixelRatioMax).toBeGreaterThan(QUALITY_PRESETS.low.pixelRatioMax);
	});
});

describe('LABEL_DENSITY_CONFIGS', () => {
	it('none hides labels', () => {
		expect(LABEL_DENSITY_CONFIGS.none.starLabelsVisible).toBe(false);
		expect(LABEL_DENSITY_CONFIGS.none.maxLabels).toBe(0);
	});

	it('notable shows default labels', () => {
		expect(LABEL_DENSITY_CONFIGS.notable.starLabelsVisible).toBe(true);
		expect(LABEL_DENSITY_CONFIGS.notable.maxLabels).toBe(60);
	});

	it('all shows more labels with wider thresholds', () => {
		const notable = LABEL_DENSITY_CONFIGS.notable;
		const all = LABEL_DENSITY_CONFIGS.all;
		expect(all.maxLabels).toBeGreaterThan(notable.maxLabels);
		expect(all.nearThreshold).toBeGreaterThan(notable.nearThreshold);
		expect(all.farThreshold).toBeGreaterThan(notable.farThreshold);
	});
});

describe('SettingsValues interface', () => {
	it('includes reducedMotion field', () => {
		const settings: SettingsValues = {
			quality: 'high',
			bloomStrength: 0.8,
			scintillation: true,
			labelDensity: 'notable',
			warpDuration: 5,
			unitPreference: 'auto',
			orbitSensitivity: 0.003,
			lookSensitivity: 0.002,
			touchSensitivity: 1,
			reducedMotion: false,
		};
		expect(settings.reducedMotion).toBe(false);
	});
});
