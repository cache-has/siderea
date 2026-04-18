/**
 * Procedural TSL node materials for planet-specific visual details.
 *
 * Each planet gets a unique MeshStandardNodeMaterial with procedural
 * patterns created via Three.js TSL (Texture Shading Language).
 * These serve as enhanced placeholders until texture maps are loaded.
 *
 * Material features:
 * - Mercury: gray cratered appearance
 * - Venus: pale yellow with swirling cloud bands
 * - Earth: blue oceans, green/brown land approximation, white polar caps
 * - Mars: red-orange terrain with white polar ice caps
 * - Jupiter: horizontal banded atmosphere with Great Red Spot hint
 * - Saturn: pale gold with subtle banding
 * - Uranus: blue-green with faint banding
 * - Neptune: deep blue with subtle atmospheric features
 */

import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
	uv,
	vec3,
	float,
	sin,
	cos,
	smoothstep,
	mix,
	abs,
	uniform,
	positionLocal,
	Fn
} from 'three/tsl';
import { Vector3 } from 'three/webgpu';

/** NAIF IDs for planets. */
const MERCURY = 1;
const VENUS = 2;
const EARTH = 3;
const MARS = 4;
const JUPITER = 5;
const SATURN = 6;
const URANUS = 7;
const NEPTUNE = 8;

/**
 * Create a procedural TSL color node for Mercury.
 * Gray-brown with subtle brightness variation simulating cratered terrain.
 */
function mercuryColor() {
	return Fn(() => {
		const u = uv();
		// Pseudo-random brightness variation from overlapping sine waves
		const noise = sin(u.x.mul(80).add(u.y.mul(60)))
			.mul(sin(u.y.mul(90).sub(u.x.mul(50))))
			.mul(0.08);
		const base = vec3(0.55, 0.5, 0.45);
		return base.add(noise);
	})();
}

/**
 * Create a procedural TSL color node for Venus.
 * Pale yellow with swirling cloud band patterns.
 */
function venusColor() {
	return Fn(() => {
		const u = uv();
		// Latitude-based cloud bands with slight swirl
		const lat = u.y.sub(0.5).mul(2.0); // -1 to 1
		const swirl = sin(lat.mul(12.0).add(u.x.mul(4.0))).mul(0.04);
		const bands = sin(lat.mul(8.0).add(swirl)).mul(0.05).add(0.5);
		const warm = vec3(0.91, 0.8, 0.62);
		const cool = vec3(0.85, 0.73, 0.55);
		return mix(cool, warm, bands);
	})();
}

/**
 * Create a procedural TSL color node for Earth with day/night lighting.
 *
 * Day side: blue oceans, green/brown land, white polar caps (as before).
 * Night side: dark ocean, procedural city lights on land masses.
 * Terminator: smooth transition (~10° wide) between day and night.
 *
 * @param sunDirUniform Sun direction in planet-local space (normalized).
 *   Updated per frame by PlanetRenderer.
 */
function earthColor(sunDirUniform: { value: Vector3 }) {
	return Fn(() => {
		const u = uv();
		const lat = u.y.sub(0.5).mul(2.0); // -1 to 1
		const absLat = abs(lat);

		// --- Surface normal (sphere: normal = normalized local position) ---
		const normal = positionLocal.normalize();
		// Cast needed: Three.js uniform() accepts {value} wrappers at runtime but types are narrower
		const sunDir = uniform(sunDirUniform.value);

		// Illumination: dot(normal, sunDir). Positive = day, negative = night.
		const rawIllum = normal.dot(sunDir);
		// Smooth terminator: transition over ~10° (sin(10°) ≈ 0.17)
		const dayFactor = smoothstep(float(-0.1), float(0.15), rawIllum);

		// --- Day-side colors ---
		const ocean = vec3(0.05, 0.15, 0.55);
		const land = vec3(0.2, 0.35, 0.12);
		const ice = vec3(0.92, 0.94, 0.96);

		// Pseudo-continent shapes using overlapping sine waves
		const continentNoise = sin(u.x.mul(14.0).add(u.y.mul(10.0)))
			.add(sin(u.x.mul(7.0).sub(u.y.mul(16.0))).mul(0.6))
			.add(sin(u.x.mul(22.0).add(u.y.mul(5.0))).mul(0.3));
		const landMask = smoothstep(float(0.3), float(0.7), continentNoise.mul(0.5).add(0.5));

		// Polar caps
		const polarMask = smoothstep(float(0.7), float(0.9), absLat);

		const daySurface = mix(ocean, land, landMask);
		const dayColor = mix(daySurface, ice, polarMask);

		// --- Night-side colors ---
		const nightOcean = vec3(0.005, 0.008, 0.025);
		const nightLand = vec3(0.01, 0.01, 0.02);

		// Procedural city lights: high-frequency noise on land areas only.
		// Multiple overlapping sine grids create a pseudo-random point pattern.
		const cityNoise1 = sin(u.x.mul(120.0)).mul(sin(u.y.mul(100.0)));
		const cityNoise2 = sin(u.x.mul(87.0).add(0.3)).mul(sin(u.y.mul(113.0).add(0.7)));
		const cityRaw = cityNoise1.add(cityNoise2).mul(0.5);
		// Threshold to create sparse bright dots
		const cityMask = smoothstep(float(0.82), float(0.95), cityRaw);
		// Only on land, not at poles (cities thin out near poles)
		const cityLatFade = smoothstep(float(0.0), float(0.15), absLat)
			.mul(smoothstep(float(0.85), float(0.65), absLat));
		const cityBrightness = cityMask.mul(landMask).mul(cityLatFade);

		// Warm yellowish city light color
		const cityColor = vec3(1.0, 0.85, 0.5);
		const nightBase = mix(nightOcean, nightLand, landMask);
		const nightColor = mix(nightBase, cityColor, cityBrightness.mul(0.8));

		// --- Blend day/night ---
		return mix(nightColor, dayColor, dayFactor);
	})();
}

/**
 * Create a procedural TSL color node for Mars.
 * Red-orange terrain with lighter polar ice caps.
 */
function marsColor() {
	return Fn(() => {
		const u = uv();
		const lat = u.y.sub(0.5).mul(2.0);
		const absLat = abs(lat);

		// Reddish terrain with variation
		const baseRed = vec3(0.72, 0.3, 0.12);
		const darkRed = vec3(0.5, 0.2, 0.08);
		const terrainNoise = sin(u.x.mul(20.0).add(u.y.mul(15.0)))
			.mul(sin(u.y.mul(25.0).sub(u.x.mul(12.0))))
			.mul(0.5)
			.add(0.5);
		const terrain = mix(darkRed, baseRed, terrainNoise);

		// Polar ice caps (white-ish, smaller than Earth's)
		const ice = vec3(0.88, 0.86, 0.82);
		const polarMask = smoothstep(float(0.82), float(0.95), absLat);

		return mix(terrain, ice, polarMask);
	})();
}

/**
 * Create a procedural TSL color node for Jupiter.
 * Horizontal banded atmosphere with alternating light zones and dark belts.
 * Includes a hint of the Great Red Spot.
 */
function jupiterColor() {
	return Fn(() => {
		const u = uv();
		const lat = u.y.sub(0.5).mul(2.0);

		// Alternating bands at varying frequencies
		const band1 = sin(lat.mul(18.0)).mul(0.5).add(0.5);
		const band2 = sin(lat.mul(30.0).add(0.5)).mul(0.3);
		const bandPattern = band1.add(band2).clamp(0.0, 1.0);

		// Zone colors (lighter) and belt colors (darker)
		const zone = vec3(0.85, 0.78, 0.65); // creamy
		const belt = vec3(0.6, 0.42, 0.25); // brown

		const atmosphere = mix(belt, zone, bandPattern);

		// Great Red Spot approximation: oval region at ~22 deg south
		const spotLat = lat.add(0.35); // offset to southern hemisphere
		const spotLon = u.x.sub(0.3);  // arbitrary longitude
		const spotDist = spotLat.mul(spotLat).mul(4.0).add(spotLon.mul(spotLon).mul(16.0));
		const spotMask = smoothstep(float(0.02), float(0.005), spotDist);
		const spotColor = vec3(0.75, 0.3, 0.15);

		return mix(atmosphere, spotColor, spotMask);
	})();
}

/**
 * Create a procedural TSL color node for Saturn.
 * Pale gold with subtle horizontal banding.
 */
function saturnColor() {
	return Fn(() => {
		const u = uv();
		const lat = u.y.sub(0.5).mul(2.0);

		// Subtle banding
		const band = sin(lat.mul(14.0)).mul(0.5).add(0.5);
		const light = vec3(0.93, 0.87, 0.7);
		const dark = vec3(0.8, 0.72, 0.52);

		return mix(dark, light, band);
	})();
}

/**
 * Create a procedural TSL color node for Uranus.
 * Blue-green with very subtle banding.
 */
function uranusColor() {
	return Fn(() => {
		const u = uv();
		const lat = u.y.sub(0.5).mul(2.0);

		const band = sin(lat.mul(10.0)).mul(0.03);
		const base = vec3(0.49, 0.78, 0.88);
		return base.add(band);
	})();
}

/**
 * Create a procedural TSL color node for Neptune.
 * Deep blue with subtle atmospheric features.
 */
function neptuneColor() {
	return Fn(() => {
		const u = uv();
		const lat = u.y.sub(0.5).mul(2.0);

		// Subtle bands
		const band = sin(lat.mul(12.0)).mul(0.04);
		// Hint of darker storm feature
		const stormLat = lat.add(0.3);
		const stormLon = u.x.sub(0.5);
		const stormDist = stormLat.mul(stormLat).mul(6.0).add(stormLon.mul(stormLon).mul(20.0));
		const stormMask = smoothstep(float(0.01), float(0.003), stormDist);

		const base = vec3(0.15, 0.25, 0.7);
		const dark = vec3(0.08, 0.12, 0.45);

		return mix(base.add(band), dark, stormMask);
	})();
}

/** Map of NAIF ID to procedural color node factory (non-Earth planets). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MATERIAL_FACTORIES: Record<number, () => any> = {
	[MERCURY]: mercuryColor,
	[VENUS]: venusColor,
	[MARS]: marsColor,
	[JUPITER]: jupiterColor,
	[SATURN]: saturnColor,
	[URANUS]: uranusColor,
	[NEPTUNE]: neptuneColor
};

/** Result from createPlanetMaterial when the planet has dynamic uniforms. */
export interface PlanetMaterialResult {
	material: MeshStandardNodeMaterial;
	/** Sun direction uniform for Earth day/night. Null for other planets. */
	sunDirUniform: { value: Vector3 } | null;
}

/**
 * Create a procedural MeshStandardNodeMaterial for a planet.
 *
 * For Earth, also returns a sunDirUniform that must be updated per frame
 * to drive the day/night terminator and city lights.
 *
 * @param naifId Planet NAIF ID (1-8)
 * @returns Material and optional uniforms, or null if no material defined
 */
export function createPlanetMaterial(naifId: number): PlanetMaterialResult | null {
	if (naifId === EARTH) {
		const sunDirUniform = { value: new Vector3(1, 0, 0) };
		const material = new MeshStandardNodeMaterial({
			roughness: 0.85,
			metalness: 0.05
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		material.colorNode = earthColor(sunDirUniform);
		return { material, sunDirUniform };
	}

	const factory = MATERIAL_FACTORIES[naifId];
	if (!factory) return null;

	const material = new MeshStandardNodeMaterial({
		roughness: 0.85,
		metalness: 0.05
	});

	// TSL node types are complex; the factory returns a valid color node
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	material.colorNode = factory();
	return { material, sunDirUniform: null };
}

/**
 * Create a semi-transparent cloud layer material for Earth.
 * Produces a wispy white pattern over transparent background.
 * Clouds on the night side are dimmed to near-invisibility.
 *
 * @param sunDirUniform Sun direction in planet-local space (shared with Earth surface material)
 */
export function createEarthCloudMaterial(sunDirUniform: { value: Vector3 }): MeshStandardNodeMaterial {
	const material = new MeshStandardNodeMaterial({
		transparent: true,
		depthWrite: false,
		roughness: 1.0,
		metalness: 0.0
	});

	material.colorNode = vec3(1.0, 1.0, 1.0);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	material.opacityNode = Fn(() => {
		const u = uv();
		const lat = u.y.sub(0.5).mul(2.0);
		const absLat = abs(lat);

		// Cloud bands with varying density
		const cloud1 = sin(u.x.mul(8.0).add(lat.mul(6.0))).mul(0.5).add(0.5);
		const cloud2 = sin(u.x.mul(14.0).sub(lat.mul(10.0))).mul(0.5).add(0.5);
		const cloud3 = cos(u.x.mul(5.0).add(lat.mul(3.0))).mul(0.5).add(0.5);

		// Combine cloud layers
		const density = cloud1.mul(cloud2).add(cloud3.mul(0.3));

		// Less clouds at poles and equator for realism
		const latFade = smoothstep(float(0.0), float(0.3), absLat)
			.mul(smoothstep(float(1.0), float(0.7), absLat));

		// Day/night dimming: clouds on the night side are barely visible
		const normal = positionLocal.normalize();
		const sunDir = uniform(sunDirUniform.value);
		const illum = normal.dot(sunDir);
		// Clouds visible on day side, fading through terminator, dim on night side
		const cloudDayFactor = smoothstep(float(-0.2), float(0.1), illum)
			.mul(0.85)
			.add(0.15); // minimum 15% so clouds don't vanish completely

		// Overall thin opacity
		return density.mul(latFade).mul(0.25).mul(cloudDayFactor).clamp(0.0, 0.35);
	})();

	return material;
}
