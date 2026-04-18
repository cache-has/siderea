/**
 * Distance-based visibility management for near-scene renderers.
 *
 * Hides detail renderers (orbits, rings, moons, belts, etc.) when the camera
 * is far from the solar system, saving draw calls and GPU work. Uses hysteresis
 * to prevent flickering at zone boundaries.
 *
 * Distance is measured in parsecs from the camera to the solar system origin.
 */

import type { Object3D } from 'three/webgpu';

/** A group of Object3Ds that share a visibility threshold. */
export interface VisibilityZone {
	/** Human-readable label for debugging. */
	label: string;
	/**
	 * Objects controlled by this zone. Their `.visible` flag is toggled.
	 * Accepts a getter so new objects added after registration are included.
	 */
	getObjects: () => (Object3D | null | undefined)[];
	/** Distance (parsecs) at which objects become visible (camera moving closer). */
	showThresholdPc: number;
	/** Distance (parsecs) at which objects become hidden (camera moving farther). */
	hideThresholdPc: number;
}

/** Predefined distance thresholds for renderer groups. */
export const VISIBILITY_THRESHOLDS = {
	/**
	 * Near-only detail: orbits, rings, atmospheres, moons, moon orbits,
	 * belts, small bodies, satellites, probes, distance labels, comets.
	 * ~0.1 pc ≈ 20,626 AU — well beyond Kuiper belt but within the Oort cloud.
	 */
	NEAR_DETAIL: { show: 0.08, hide: 0.12 },
	/**
	 * Dwarf planets: slightly larger fade zone since they're dimmer.
	 */
	DWARF_PLANETS: { show: 0.06, hide: 0.10 },
	/**
	 * Transfer orbits, geodesic explorer, light paths.
	 */
	NAVIGATION: { show: 0.08, hide: 0.12 }
} as const;

export class VisibilityManager {
	private zones: VisibilityZone[] = [];
	/** Track current visibility state per zone to avoid redundant `.visible` writes. */
	private zoneVisible: boolean[] = [];

	/** Register a visibility zone. All zones start visible. */
	addZone(zone: VisibilityZone): void {
		this.zones.push(zone);
		this.zoneVisible.push(true);
	}

	/**
	 * Update visibility based on camera distance from solar system origin.
	 * Call once per frame with the camera's distance in parsecs.
	 */
	update(cameraDistancePc: number): void {
		for (let i = 0; i < this.zones.length; i++) {
			const zone = this.zones[i];
			const wasVisible = this.zoneVisible[i];

			// Hysteresis: use different thresholds for show vs hide
			let shouldBeVisible: boolean;
			if (wasVisible) {
				// Currently visible — hide only when past the hide threshold
				shouldBeVisible = cameraDistancePc <= zone.hideThresholdPc;
			} else {
				// Currently hidden — show only when within the show threshold
				shouldBeVisible = cameraDistancePc <= zone.showThresholdPc;
			}

			if (shouldBeVisible !== wasVisible) {
				this.zoneVisible[i] = shouldBeVisible;
				const objects = zone.getObjects();
				for (const obj of objects) {
					if (obj) obj.visible = shouldBeVisible;
				}
			}
		}
	}

	/** Force all zones visible (e.g., when resetting camera). */
	showAll(): void {
		for (let i = 0; i < this.zones.length; i++) {
			this.zoneVisible[i] = true;
			const objects = this.zones[i].getObjects();
			for (const obj of objects) {
				if (obj) obj.visible = true;
			}
		}
	}

	/** Get current zone states for debugging. */
	get states(): { label: string; visible: boolean }[] {
		return this.zones.map((z, i) => ({ label: z.label, visible: this.zoneVisible[i] }));
	}

	dispose(): void {
		this.zones.length = 0;
		this.zoneVisible.length = 0;
	}
}
