/**
 * Persistent settings state for the Siderea UI.
 *
 * Manages user-configurable rendering and interaction preferences.
 * Persists to localStorage so settings survive page reloads.
 *
 * Separate from HudState (which tracks transient per-frame state).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Visual quality preset. Controls bloom, pixel ratio, and label budgets. */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

/** Label density mode. */
export type LabelDensity = 'none' | 'notable' | 'all';

/** Distance unit preference. 'auto' selects the best unit by magnitude. */
export type UnitPreference = 'auto' | 'km' | 'AU' | 'ly' | 'pc';

/** Full settings shape. */
export interface SettingsValues {
	quality: QualityPreset;
	bloomStrength: number;
	scintillation: boolean;
	labelDensity: LabelDensity;
	warpDuration: number;
	unitPreference: UnitPreference;
	orbitSensitivity: number;
	lookSensitivity: number;
	touchSensitivity: number;
	reducedMotion: boolean;
}

// ─── Quality Presets ─────────────────────────────────────────────────────────

export interface QualityValues {
	pixelRatioMax: number;
	bloomStrength: number;
	bloomRadius: number;
	bloomThreshold: number;
	starLabelMaxLabels: number;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityValues> = {
	low: {
		pixelRatioMax: 1,
		bloomStrength: 0.3,
		bloomRadius: 0.3,
		bloomThreshold: 1.0,
		starLabelMaxLabels: 30,
	},
	medium: {
		pixelRatioMax: 1.5,
		bloomStrength: 0.6,
		bloomRadius: 0.4,
		bloomThreshold: 0.8,
		starLabelMaxLabels: 60,
	},
	high: {
		pixelRatioMax: 2,
		bloomStrength: 0.8,
		bloomRadius: 0.4,
		bloomThreshold: 0.8,
		starLabelMaxLabels: 60,
	},
	ultra: {
		pixelRatioMax: 3,
		bloomStrength: 1.0,
		bloomRadius: 0.5,
		bloomThreshold: 0.6,
		starLabelMaxLabels: 100,
	}
};

// ─── Label Density Configs ───────────────────────────────────────────────────

export interface LabelDensityValues {
	starLabelsVisible: boolean;
	nearThreshold: number;
	farThreshold: number;
	midMagLimit: number;
	maxLabels: number;
}

export const LABEL_DENSITY_CONFIGS: Record<LabelDensity, LabelDensityValues> = {
	none: {
		starLabelsVisible: false,
		nearThreshold: 50,
		farThreshold: 500,
		midMagLimit: 2.0,
		maxLabels: 0,
	},
	notable: {
		starLabelsVisible: true,
		nearThreshold: 50,
		farThreshold: 500,
		midMagLimit: 2.0,
		maxLabels: 60,
	},
	all: {
		starLabelsVisible: true,
		nearThreshold: 200,
		farThreshold: 2000,
		midMagLimit: 6.0,
		maxLabels: 150,
	}
};

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Detect OS-level reduced motion preference. */
function osReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const DEFAULTS: SettingsValues = {
	quality: 'high',
	bloomStrength: 0.8,
	scintillation: true,
	labelDensity: 'notable',
	warpDuration: 5,
	unitPreference: 'auto',
	orbitSensitivity: 0.003,
	lookSensitivity: 0.002,
	touchSensitivity: 1,
	reducedMotion: osReducedMotion(),
};

const STORAGE_KEY = 'siderea-settings';

// ─── Persistence ─────────────────────────────────────────────────────────────

function loadFromStorage(): Partial<SettingsValues> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return {};
		return parsed;
	} catch {
		return {};
	}
}

function saveToStorage(values: SettingsValues): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
	} catch {
		// Private browsing or quota exceeded — silently ignore
	}
}

// ─── State Factory ───────────────────────────────────────────────────────────

/** Create a new settings state instance. Call once in +page.svelte. */
export function createSettingsState() {
	const stored = loadFromStorage();
	const initial = { ...DEFAULTS, ...stored };

	let quality = $state<QualityPreset>(initial.quality);
	let bloomStrength = $state(initial.bloomStrength);
	let scintillation = $state(initial.scintillation);
	let labelDensity = $state<LabelDensity>(initial.labelDensity);
	let warpDuration = $state(initial.warpDuration);
	let unitPreference = $state<UnitPreference>(initial.unitPreference);
	let orbitSensitivity = $state(initial.orbitSensitivity);
	let lookSensitivity = $state(initial.lookSensitivity);
	let touchSensitivity = $state(initial.touchSensitivity);
	let reducedMotion = $state(initial.reducedMotion);
	let panelVisible = $state(false);

	function persist() {
		saveToStorage({
			quality,
			bloomStrength,
			scintillation,
			labelDensity,
			warpDuration,
			unitPreference,
			orbitSensitivity,
			lookSensitivity,
			touchSensitivity,
			reducedMotion,
		});
	}

	return {
		// Panel visibility
		get panelVisible() { return panelVisible; },
		set panelVisible(v: boolean) { panelVisible = v; },
		togglePanel() { panelVisible = !panelVisible; },

		// Quality
		get quality() { return quality; },
		set quality(v: QualityPreset) {
			quality = v;
			// Apply preset bloom strength
			bloomStrength = QUALITY_PRESETS[v].bloomStrength;
			persist();
		},
		get qualityValues(): QualityValues { return QUALITY_PRESETS[quality]; },

		// Bloom
		get bloomStrength() { return bloomStrength; },
		set bloomStrength(v: number) { bloomStrength = Math.max(0, Math.min(2, v)); persist(); },

		// Scintillation
		get scintillation() { return scintillation; },
		set scintillation(v: boolean) { scintillation = v; persist(); },
		toggleScintillation() { scintillation = !scintillation; persist(); },

		// Label density
		get labelDensity() { return labelDensity; },
		set labelDensity(v: LabelDensity) { labelDensity = v; persist(); },
		get labelDensityValues(): LabelDensityValues { return LABEL_DENSITY_CONFIGS[labelDensity]; },

		// Warp
		get warpDuration() { return warpDuration; },
		set warpDuration(v: number) { warpDuration = Math.max(1, Math.min(15, v)); persist(); },

		// Units
		get unitPreference() { return unitPreference; },
		set unitPreference(v: UnitPreference) { unitPreference = v; persist(); },

		// Controls
		get orbitSensitivity() { return orbitSensitivity; },
		set orbitSensitivity(v: number) { orbitSensitivity = Math.max(0.0005, Math.min(0.02, v)); persist(); },

		get lookSensitivity() { return lookSensitivity; },
		set lookSensitivity(v: number) { lookSensitivity = Math.max(0.0005, Math.min(0.02, v)); persist(); },

		get touchSensitivity() { return touchSensitivity; },
		set touchSensitivity(v: number) { touchSensitivity = Math.max(0.25, Math.min(4, v)); persist(); },

		// Reduced motion
		get reducedMotion() { return reducedMotion; },
		set reducedMotion(v: boolean) { reducedMotion = v; persist(); },
		toggleReducedMotion() { reducedMotion = !reducedMotion; persist(); },

		/** Effective warp duration: near-instant when reduced motion is on. */
		get effectiveWarpDuration(): number { return reducedMotion ? 0.5 : warpDuration; },

		/** Effective scintillation: disabled when reduced motion is on. */
		get effectiveScintillation(): boolean { return reducedMotion ? false : scintillation; },

		/** Reset all settings to defaults. */
		resetAll() {
			quality = DEFAULTS.quality;
			bloomStrength = DEFAULTS.bloomStrength;
			scintillation = DEFAULTS.scintillation;
			labelDensity = DEFAULTS.labelDensity;
			warpDuration = DEFAULTS.warpDuration;
			unitPreference = DEFAULTS.unitPreference;
			orbitSensitivity = DEFAULTS.orbitSensitivity;
			lookSensitivity = DEFAULTS.lookSensitivity;
			touchSensitivity = DEFAULTS.touchSensitivity;
			reducedMotion = DEFAULTS.reducedMotion;
			persist();
		},
	};
}

export type SettingsState = ReturnType<typeof createSettingsState>;
