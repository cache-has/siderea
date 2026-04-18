/**
 * Texture manifest mapping celestial body NAIF IDs to their texture files.
 *
 * Each entry specifies the base filename (without extension) and the
 * maximum LOD tier available for that body. The TextureLODManager
 * appends the tier directory and .webp extension at load time.
 *
 * Texture path pattern: /textures/{tier}/{filename}.webp
 * where tier ∈ {128, 512, 2048}
 *
 * Sources and licenses documented in TEXTURE-CREDITS.md.
 */

/** LOD tier widths in pixels, ascending. */
export const LOD_TIERS = [128, 512, 2048] as const;
export type LODTier = (typeof LOD_TIERS)[number];

export interface TextureEntry {
	/** Base filename without extension (e.g. 'earth_daymap'). */
	filename: string;
	/** Maximum LOD tier available for this texture. */
	maxTier: LODTier;
}

export interface BodyTextureSet {
	/** Primary surface/color map. */
	color: TextureEntry;
	/** Night-side emission map (Earth only). */
	night?: TextureEntry;
	/** Cloud layer map (Earth only). */
	clouds?: TextureEntry;
}

export interface RingTextureEntry {
	/** Base filename without extension. */
	filename: string;
	/** Maximum LOD tier available. */
	maxTier: LODTier;
}

/**
 * Planet and dwarf planet surface textures, keyed by NAIF ID.
 */
export const BODY_TEXTURES: Record<number, BodyTextureSet> = {
	// Note: Sun texture exists (sun.webp) but is not mapped here — Sun uses
	// SunRenderer with emissive procedural material, not PlanetRenderer.
	// Ceres (NAIF 10) is in DwarfPlanetRenderer, not to be confused with Sun (NAIF 10 in JPL).

	// Mercury
	1: {
		color: { filename: 'mercury', maxTier: 2048 }
	},

	// Venus (atmosphere texture)
	2: {
		color: { filename: 'venus_atmosphere', maxTier: 2048 }
	},

	// Earth (day + night + clouds)
	3: {
		color: { filename: 'earth_daymap', maxTier: 2048 },
		night: { filename: 'earth_nightmap', maxTier: 2048 },
		clouds: { filename: 'earth_clouds', maxTier: 2048 }
	},

	// Mars
	4: {
		color: { filename: 'mars', maxTier: 2048 }
	},

	// Jupiter
	5: {
		color: { filename: 'jupiter', maxTier: 2048 }
	},

	// Saturn
	6: {
		color: { filename: 'saturn', maxTier: 2048 }
	},

	// Uranus (only 2K source → max tier 2048 still works, just upscaled)
	7: {
		color: { filename: 'uranus', maxTier: 2048 }
	},

	// Neptune (only 2K source)
	8: {
		color: { filename: 'neptune', maxTier: 2048 }
	},

	// Pluto
	9: {
		color: { filename: 'pluto', maxTier: 2048 }
	},

	// Ceres (artistic)
	10: {
		color: { filename: 'ceres', maxTier: 2048 }
	},

	// Eris (artistic)
	11: {
		color: { filename: 'eris', maxTier: 2048 }
	},

	// Haumea (artistic)
	12: {
		color: { filename: 'haumea', maxTier: 2048 }
	},

	// Makemake (artistic)
	13: {
		color: { filename: 'makemake', maxTier: 2048 }
	}
};

/**
 * Moon textures, keyed by NAIF ID.
 * Currently only Earth's Moon has a texture; other moons use flat colors.
 */
export const MOON_TEXTURES: Record<number, BodyTextureSet> = {
	// Earth's Moon (NASA SVS CGI Moon Kit)
	301: {
		color: { filename: 'moon', maxTier: 2048 }
	}
};

/**
 * Ring textures, keyed by parent body NAIF ID.
 */
export const RING_TEXTURES: Record<number, RingTextureEntry> = {
	// Saturn rings (with alpha transparency)
	6: { filename: 'saturn_ring_alpha', maxTier: 2048 }
};

/**
 * Build the URL path for a texture at a given LOD tier.
 */
export function textureUrl(filename: string, tier: LODTier): string {
	return `/textures/${tier}/${filename}.webp`;
}

/**
 * Get the appropriate LOD tier for a given distance.
 *
 * Distance thresholds (in AU, with standard 200× exaggeration):
 * - < 0.002 AU (~300,000 km visual): 2048px (close-up)
 * - < 0.01 AU  (~1.5M km visual):    512px  (medium)
 * - ≥ 0.01 AU:                        128px  (distant)
 */
export function tierForDistance(distanceAU: number): LODTier {
	if (distanceAU < 0.002) return 2048;
	if (distanceAU < 0.01) return 512;
	return 128;
}
