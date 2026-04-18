/**
 * Shared formatting utilities for UI components.
 */

import type { UnitPreference } from './settings-state.svelte';

const KM_PER_AU = 149_597_870.7;
const AU_PER_LY = 63_241.077;
const AU_PER_PC = 206_264.806;

/**
 * Module-level default unit preference.
 * Set via setDefaultUnit() from a settings $effect so all formatDistanceAU
 * calls automatically use the user's preference without threading it through.
 */
let defaultUnit: UnitPreference = 'auto';

/** Set the default unit preference for formatDistanceAU. */
export function setDefaultUnit(unit: UnitPreference): void {
	defaultUnit = unit;
}

/** Format a number with comma separators. */
function commaFmt(n: number, decimals: number): string {
	const parts = n.toFixed(decimals).split('.');
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return parts.join('.');
}

/**
 * Format a distance in AU using context-appropriate units.
 * Covers the full range from kilometers to kilolight-years.
 *
 * @param au Distance in astronomical units.
 * @param unit Unit preference: 'auto' picks best unit, others force a specific unit.
 */
export function formatDistanceAU(au: number, unit?: UnitPreference): string {
	const u = unit ?? defaultUnit;
	if (u === 'km') {
		const km = au * KM_PER_AU;
		if (km < 1e6) return `${commaFmt(km, 0)} km`;
		return `${commaFmt(km / 1e6, 2)} M km`;
	}
	if (u === 'AU') {
		return `${commaFmt(au, au < 10 ? 3 : 1)} AU`;
	}
	if (u === 'ly') {
		const ly = au / AU_PER_LY;
		if (ly < 1000) return `${ly.toFixed(ly < 1 ? 4 : 1)} ly`;
		return `${(ly / 1000).toFixed(1)} kly`;
	}
	if (u === 'pc') {
		const pc = au / AU_PER_PC;
		if (pc < 1000) return `${pc.toFixed(pc < 1 ? 4 : 1)} pc`;
		return `${(pc / 1000).toFixed(1)} kpc`;
	}

	// Auto: pick the most readable unit for the magnitude
	if (au < 0.001) {
		const km = au * KM_PER_AU;
		return `${commaFmt(km, 0)} km`;
	}
	if (au < 0.1) {
		return `${(au * KM_PER_AU / 1e6).toFixed(3)} M km`;
	}
	if (au < AU_PER_LY) {
		return `${au.toFixed(au < 10 ? 3 : 1)} AU`;
	}
	const ly = au / AU_PER_LY;
	if (ly < 1000) {
		return `${ly.toFixed(1)} ly`;
	}
	return `${(ly / 1000).toFixed(1)} kly`;
}
