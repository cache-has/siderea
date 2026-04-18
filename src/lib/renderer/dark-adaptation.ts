/**
 * Dark adaptation — dynamic brightness adjustment based on proximity to the Sun.
 *
 * Simulates the eye's ability to adapt to darkness: near the Sun, the star
 * background dims (overwhelmed by solar brightness); in deep space, stars
 * appear more vivid as there's no competing light source.
 *
 * All curves use smooth interpolation (hermite/log) to avoid perceptible pops.
 *
 * Distance thresholds (in AU from the Sun):
 *   < 0.3 AU  — very close (inside Mercury orbit): heavy star dimming
 *   0.3–2 AU  — inner solar system: moderate dimming
 *   2–10 AU   — outer solar system: transition to normal
 *   10–100 AU — deep solar system: normal viewing
 *   > 100 AU  — interstellar: enhanced star visibility
 */

export interface DarkAdaptationFactors {
	/** Star field brightness multiplier (0 = invisible, 1 = normal, >1 = enhanced). */
	starBrightness: number;
	/** Bloom strength multiplier (1 = normal, >1 = boosted near Sun). */
	bloomMultiplier: number;
	/** Tone mapping exposure (1 = normal, <1 = dimmed overall). */
	exposure: number;
}

/**
 * Compute dark adaptation factors from camera distance to the Sun.
 *
 * @param distanceAU Distance from camera to the Sun in AU.
 * @returns Adaptation factors to apply to rendering pipeline.
 */
export function computeDarkAdaptation(distanceAU: number): DarkAdaptationFactors {
	// Clamp to avoid division by zero
	const d = Math.max(0.001, distanceAU);

	// --- Star brightness ---
	// Log-based curve: stars are dim near the Sun, normal by ~5 AU, enhanced past ~100 AU.
	// log10(0.3) ≈ -0.52, log10(5) ≈ 0.70, log10(100) = 2.0
	const logD = Math.log10(d);

	let starBrightness: number;
	if (logD < -0.5) {
		// Very close to Sun (< 0.3 AU): heavy dimming
		starBrightness = 0.15;
	} else if (logD < 0.7) {
		// Inner solar system (0.3–5 AU): smooth ramp from 0.15 to 1.0
		const t = (logD + 0.5) / 1.2; // 0 → 1 over the range
		starBrightness = 0.15 + 0.85 * smootherstep(t);
	} else if (logD < 2.0) {
		// Outer solar system (5–100 AU): slight boost from 1.0 to 1.15
		const t = (logD - 0.7) / 1.3;
		starBrightness = 1.0 + 0.15 * smootherstep(t);
	} else {
		// Interstellar (>100 AU): enhanced visibility
		starBrightness = 1.15;
	}

	// --- Bloom multiplier ---
	// Stronger bloom near the Sun makes the glare feel overwhelming.
	// Tapers from 1.6× at 0.1 AU to 1.0× at 3 AU.
	let bloomMultiplier: number;
	if (d < 3.0) {
		const t = Math.min(1, d / 3.0);
		bloomMultiplier = 1.0 + 0.6 * (1 - smootherstep(t));
	} else {
		bloomMultiplier = 1.0;
	}

	// --- Exposure ---
	// Slight exposure reduction very close to the Sun to prevent blowout.
	// Below 0.5 AU: ramp from 0.7 to 1.0. Normal elsewhere.
	let exposure: number;
	if (d < 0.5) {
		const t = d / 0.5;
		exposure = 0.7 + 0.3 * smootherstep(t);
	} else {
		exposure = 1.0;
	}

	return { starBrightness, bloomMultiplier, exposure };
}

/** Smootherstep (Ken Perlin's improved version): zero first and second derivatives at 0 and 1. */
function smootherstep(t: number): number {
	const x = Math.max(0, Math.min(1, t));
	return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Temporally smooth adaptation factors to avoid jarring brightness changes.
 * Uses exponential decay toward target values.
 *
 * @param current Current smoothed factors.
 * @param target Target factors from computeDarkAdaptation().
 * @param dt Frame delta time in seconds.
 * @param speed Adaptation speed (higher = faster). @default 2.0
 * @returns Smoothed factors (mutates and returns `current`).
 */
export function smoothAdaptation(
	current: DarkAdaptationFactors,
	target: DarkAdaptationFactors,
	dt: number,
	speed = 2.0
): DarkAdaptationFactors {
	const factor = 1 - Math.exp(-speed * dt);
	current.starBrightness += (target.starBrightness - current.starBrightness) * factor;
	current.bloomMultiplier += (target.bloomMultiplier - current.bloomMultiplier) * factor;
	current.exposure += (target.exposure - current.exposure) * factor;
	return current;
}
