/**
 * Texture LOD (Level of Detail) manager.
 *
 * Manages progressive texture loading for celestial bodies:
 * - Loads lowest resolution (128px) immediately on init
 * - Upgrades to higher resolutions as the camera approaches
 * - Downgrades when the camera moves away (frees GPU memory)
 * - Handles concurrent load requests without race conditions
 *
 * Integrates with PlanetRenderer.applyTexture() and similar methods
 * on DwarfPlanetRenderer and MoonRenderer.
 */

import { TextureLoader } from 'three/webgpu';
import type { Texture } from 'three/webgpu';
import {
	BODY_TEXTURES,
	MOON_TEXTURES,
	RING_TEXTURES,
	LOD_TIERS,
	textureUrl,
	tierForDistance,
	type LODTier,
	type TextureEntry
} from './texture-manifest';

/** Callback to apply a loaded texture to a renderer. */
type ApplyTextureFn = (naifId: number, texture: Texture) => void;

/** Tracks the loaded state for a single texture slot. */
interface TextureSlot {
	naifId: number;
	entry: TextureEntry;
	/** Currently loaded LOD tier, or null if nothing loaded yet. */
	currentTier: LODTier | null;
	/** Tier currently being loaded (to prevent duplicate requests). */
	loadingTier: LODTier | null;
	/** The loaded Three.js texture object (for disposal). */
	texture: Texture | null;
	/** Callback to apply the texture to the appropriate renderer. */
	apply: ApplyTextureFn;
}

export interface TextureLODManagerOptions {
	/** Function to apply textures to planets (NAIF 1-8). */
	applyPlanetTexture: ApplyTextureFn;
	/** Function to apply textures to dwarf planets (NAIF 9-13). */
	applyDwarfTexture?: ApplyTextureFn;
	/** Function to apply textures to moons. */
	applyMoonTexture?: ApplyTextureFn;
	/** Function to apply ring texture. */
	applyRingTexture?: (naifId: number, texture: Texture) => void;
	/** Function to get camera distance to a body (in AU). */
	getDistanceAU: (naifId: number) => number | null;
}

export class TextureLODManager {
	private loader = new TextureLoader();
	private slots: TextureSlot[] = [];
	private ringSlots: Array<{
		naifId: number;
		filename: string;
		maxTier: LODTier;
		currentTier: LODTier | null;
		loadingTier: LODTier | null;
		texture: Texture | null;
		apply: (naifId: number, texture: Texture) => void;
	}> = [];
	private getDistanceAU: (naifId: number) => number | null;
	private initialized = false;

	constructor(private options: TextureLODManagerOptions) {
		this.getDistanceAU = options.getDistanceAU;

		// Register planet texture slots
		for (const [naifStr, texSet] of Object.entries(BODY_TEXTURES)) {
			const naifId = Number(naifStr);
			const apply =
				naifId <= 8
					? options.applyPlanetTexture
					: options.applyDwarfTexture ?? options.applyPlanetTexture;

			this.slots.push({
				naifId,
				entry: texSet.color,
				currentTier: null,
				loadingTier: null,
				texture: null,
				apply
			});
		}

		// Register moon texture slots
		if (options.applyMoonTexture) {
			for (const [naifStr, texSet] of Object.entries(MOON_TEXTURES)) {
				this.slots.push({
					naifId: Number(naifStr),
					entry: texSet.color,
					currentTier: null,
					loadingTier: null,
					texture: null,
					apply: options.applyMoonTexture
				});
			}
		}

		// Register ring texture slots
		if (options.applyRingTexture) {
			for (const [naifStr, ringEntry] of Object.entries(RING_TEXTURES)) {
				this.ringSlots.push({
					naifId: Number(naifStr),
					filename: ringEntry.filename,
					maxTier: ringEntry.maxTier,
					currentTier: null,
					loadingTier: null,
					texture: null,
					apply: options.applyRingTexture
				});
			}
		}
	}

	/**
	 * Initialize by loading the lowest LOD tier for all bodies.
	 * Call once after renderers are set up. Non-blocking — fires and forgets.
	 */
	init(): void {
		if (this.initialized) return;
		this.initialized = true;

		const lowestTier = LOD_TIERS[0]; // 128

		for (const slot of this.slots) {
			this.loadSlot(slot, lowestTier);
		}

		for (const ring of this.ringSlots) {
			this.loadRingSlot(ring, lowestTier);
		}
	}

	/**
	 * Update LOD levels based on current camera distances.
	 * Call once per frame or on a throttled interval.
	 */
	update(): void {
		for (const slot of this.slots) {
			const dist = this.getDistanceAU(slot.naifId);
			if (dist === null) continue;

			const desiredTier = tierForDistance(dist);
			// Clamp to max available tier
			const tier = Math.min(desiredTier, slot.entry.maxTier) as LODTier;

			if (tier !== slot.currentTier && tier !== slot.loadingTier) {
				this.loadSlot(slot, tier);
			}
		}

		// Ring slots use the parent body distance
		for (const ring of this.ringSlots) {
			const dist = this.getDistanceAU(ring.naifId);
			if (dist === null) continue;

			const desiredTier = tierForDistance(dist);
			const tier = Math.min(desiredTier, ring.maxTier) as LODTier;

			if (tier !== ring.currentTier && tier !== ring.loadingTier) {
				this.loadRingSlot(ring, tier);
			}
		}
	}

	private loadSlot(slot: TextureSlot, tier: LODTier): void {
		slot.loadingTier = tier;
		const url = textureUrl(slot.entry.filename, tier);

		this.loader.loadAsync(url).then(
			(texture) => {
				// Race condition guard: only apply if this is still the desired tier
				if (slot.loadingTier !== tier) {
					texture.dispose();
					return;
				}

				// Dispose previous texture
				if (slot.texture) {
					slot.texture.dispose();
				}

				slot.texture = texture;
				slot.currentTier = tier;
				slot.loadingTier = null;

				slot.apply(slot.naifId, texture);
			},
			(err) => {
				// Silently fail — procedural materials remain as fallback
				if (slot.loadingTier === tier) {
					slot.loadingTier = null;
				}
				console.warn(`[TextureLOD] Failed to load ${url}:`, err);
			}
		);
	}

	private loadRingSlot(
		ring: (typeof this.ringSlots)[number],
		tier: LODTier
	): void {
		ring.loadingTier = tier;
		const url = textureUrl(ring.filename, tier);

		this.loader.loadAsync(url).then(
			(texture) => {
				if (ring.loadingTier !== tier) {
					texture.dispose();
					return;
				}

				if (ring.texture) {
					ring.texture.dispose();
				}

				ring.texture = texture;
				ring.currentTier = tier;
				ring.loadingTier = null;

				ring.apply(ring.naifId, texture);
			},
			(err) => {
				if (ring.loadingTier === tier) {
					ring.loadingTier = null;
				}
				console.warn(`[TextureLOD] Failed to load ring ${url}:`, err);
			}
		);
	}

	/** Clean up all loaded textures. */
	dispose(): void {
		for (const slot of this.slots) {
			slot.texture?.dispose();
			slot.texture = null;
			slot.currentTier = null;
			slot.loadingTier = null;
		}
		for (const ring of this.ringSlots) {
			ring.texture?.dispose();
			ring.texture = null;
			ring.currentTier = null;
			ring.loadingTier = null;
		}
	}
}
