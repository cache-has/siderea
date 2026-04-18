/**
 * Approach detection — auto-selects objects when the camera gets close.
 *
 * Runs per-frame inside the onFrame callback. Uses configurable distance
 * thresholds per object type and implements cooldown/hysteresis so the
 * same object isn't re-triggered until the camera moves away.
 */

import { Vector3 } from 'three/webgpu';

/** Object kinds the detector understands. */
export type ApproachObjectKind = 'body' | 'satellite';

/** A registered object the detector monitors. */
export interface ApproachCandidate {
	/** Unique key for cooldown tracking (e.g. naif_id or satellite id). */
	key: string;
	/** Display name. */
	name: string;
	/** Object kind. */
	kind: ApproachObjectKind;
	/** Returns current world position in AU. Null if position unavailable. */
	getPosition: () => Vector3 | null;
	/** Approach trigger radius in AU. Camera closer than this triggers approach. */
	triggerRadius: number;
	/** Hysteresis exit radius in AU. Camera must exceed this before re-trigger. */
	exitRadius: number;
}

/** Result emitted when the camera approaches an object. */
export interface ApproachEvent {
	key: string;
	name: string;
	kind: ApproachObjectKind;
	distance: number;
	position: Vector3;
}

/**
 * Approach detector — call `update()` each frame with the camera position.
 *
 * Design:
 * - Pre-filters candidates by a coarse distance check before computing exact distance.
 * - Tracks cooldown state per object: once triggered, the camera must exit `exitRadius`
 *   before the same object can trigger again.
 * - Only returns the single closest approaching object per frame (avoids cascade).
 */
export class ApproachDetector {
	private candidates: ApproachCandidate[] = [];
	/** Set of keys currently in cooldown (already triggered, camera hasn't exited). */
	private cooldown = new Set<string>();
	/** Reusable Vector3 to avoid allocations. */
	private _tmpVec = new Vector3();

	/** Pre-filter: skip candidates whose trigger radius is smaller than this. */
	private static readonly MIN_COARSE_RADIUS = 0.0001; // ~15,000 km in AU

	/** Register a candidate for monitoring. Replaces any existing entry with the same key. */
	register(candidate: ApproachCandidate): void {
		const idx = this.candidates.findIndex(c => c.key === candidate.key);
		if (idx >= 0) {
			this.candidates[idx] = candidate;
		} else {
			this.candidates.push(candidate);
		}
	}

	/** Remove a candidate by key. */
	unregister(key: string): void {
		const idx = this.candidates.findIndex(c => c.key === key);
		if (idx >= 0) this.candidates.splice(idx, 1);
		this.cooldown.delete(key);
	}

	/** Remove all candidates. */
	clear(): void {
		this.candidates.length = 0;
		this.cooldown.clear();
	}

	/** Reset cooldown for a specific key (e.g. after manual deselection). */
	resetCooldown(key: string): void {
		this.cooldown.delete(key);
	}

	/** Reset all cooldowns. */
	resetAllCooldowns(): void {
		this.cooldown.clear();
	}

	/**
	 * Check all candidates against the camera position.
	 * Returns an ApproachEvent for the closest newly-triggered object, or null.
	 */
	update(cameraPosition: Vector3): ApproachEvent | null {
		let bestEvent: ApproachEvent | null = null;
		let bestDist = Infinity;

		for (const candidate of this.candidates) {
			const pos = candidate.getPosition();
			if (!pos) continue;

			const dist = cameraPosition.distanceTo(pos);

			// Hysteresis: if in cooldown, check if camera has exited
			if (this.cooldown.has(candidate.key)) {
				if (dist > candidate.exitRadius) {
					this.cooldown.delete(candidate.key);
				}
				continue;
			}

			// Trigger check
			if (dist < candidate.triggerRadius && dist < bestDist) {
				bestDist = dist;
				bestEvent = {
					key: candidate.key,
					name: candidate.name,
					kind: candidate.kind,
					distance: dist,
					position: pos.clone()
				};
			}
		}

		// Mark as triggered
		if (bestEvent) {
			this.cooldown.add(bestEvent.key);
		}

		return bestEvent;
	}

	/** Number of registered candidates (for diagnostics). */
	get candidateCount(): number {
		return this.candidates.length;
	}

	/** Number of objects currently in cooldown. */
	get cooldownCount(): number {
		return this.cooldown.size;
	}
}

// --- Threshold helpers ---

const KM_PER_AU = 1.495978707e8; // km

/**
 * Compute approach trigger radius for a solar system body.
 * Uses 5x the exaggerated visual radius so the trigger fires when
 * the camera is comfortably close, not inside the sphere.
 */
export function bodyTriggerRadius(radiusKm: number, exaggeration: number): number {
	const radiusAU = (radiusKm / KM_PER_AU) * exaggeration;
	return Math.max(radiusAU * 5, 0.001); // minimum ~150,000 km
}

/**
 * Compute hysteresis exit radius — 3x the trigger radius.
 * Camera must move this far away before re-triggering.
 */
export function bodyExitRadius(triggerRadius: number): number {
	return triggerRadius * 3;
}

/** Fixed trigger radius for satellites (0.002 AU ≈ 300,000 km). */
export const SATELLITE_TRIGGER_RADIUS = 0.002;

/** Fixed exit radius for satellites. */
export const SATELLITE_EXIT_RADIUS = 0.006;
