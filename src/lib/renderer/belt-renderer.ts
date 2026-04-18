/**
 * GPU-instanced particle cloud renderer for the asteroid belt and Kuiper belt.
 *
 * Renders thousands of particles as screen-aligned sprite quads using the same
 * Sprite + PointsNodeMaterial + InstancedBufferAttribute pattern as StarFieldRenderer.
 *
 * Positions are generated procedurally using Keplerian orbit distributions:
 * - Asteroid belt (2.2–3.2 AU): low eccentricity/inclination, Kirkwood gaps
 * - Kuiper belt (30–50 AU): broader inclination, thicker disk
 *
 * Coordinates: near-scene space, 1 unit = 1 AU (J2000 ecliptic heliocentric).
 *
 * Sources:
 * - Kirkwood gaps: 4:1 (2.06 AU), 3:1 (2.50 AU), 5:2 (2.82 AU), 7:3 (2.95 AU), 2:1 (3.27 AU)
 * - Asteroid belt distribution: Ivezić et al. (2001), AJ 122, 2749
 * - Kuiper belt structure: Gladman et al. (2012), AJ 144, 23
 */

import {
	Sprite,
	InstancedBufferAttribute
} from 'three/webgpu';
import { PointsNodeMaterial } from 'three/webgpu';
import {
	instancedBufferAttribute,
	uv,
	vec2,
	vec3,
	float,
	smoothstep,
	Fn
} from 'three/tsl';
import type { Scene } from 'three/webgpu';

// ---------------------------------------------------------------------------
// Belt configuration types
// ---------------------------------------------------------------------------

/** Configuration for a particle belt. */
export interface BeltConfig {
	/** Number of particles to generate. */
	particleCount: number;
	/** Inner edge of the belt in AU. */
	innerRadiusAU: number;
	/** Outer edge of the belt in AU. */
	outerRadiusAU: number;
	/** Maximum orbital eccentricity (uniform random [0, maxEccentricity]). */
	maxEccentricity: number;
	/** Maximum orbital inclination in radians (Rayleigh-distributed). */
	maxInclinationRad: number;
	/** Base particle size in scene units. */
	baseSize: number;
	/** Size variation factor (particle size = baseSize * (1 + random * sizeVariation)). */
	sizeVariation: number;
	/** Particle color as [r, g, b] in [0, 1] range. */
	color: [number, number, number];
	/** Particle opacity. */
	opacity: number;
}

export interface BeltRendererOptions {
	/** Asteroid belt config override. */
	asteroidBelt?: Partial<BeltConfig>;
	/** Kuiper belt config override. */
	kuiperBelt?: Partial<BeltConfig>;
}

// ---------------------------------------------------------------------------
// Kirkwood gap model
// ---------------------------------------------------------------------------

/**
 * Kirkwood gaps — semi-major axes of mean-motion resonances with Jupiter
 * where asteroids are depleted. Each gap is modeled as a Gaussian dip
 * in the probability distribution.
 *
 * Format: [center AU, half-width AU, depletion depth (0–1)]
 */
const KIRKWOOD_GAPS: [number, number, number][] = [
	[2.06, 0.02, 0.90],  // 4:1 resonance
	[2.50, 0.03, 0.95],  // 3:1 resonance (strongest)
	[2.82, 0.02, 0.80],  // 5:2 resonance
	[2.95, 0.02, 0.70],  // 7:3 resonance
	[3.27, 0.03, 0.90],  // 2:1 resonance
];

/**
 * Compute the probability weight for a given semi-major axis in the asteroid belt,
 * accounting for Kirkwood gap depletion.
 *
 * Returns a value in (0, 1] where 1 = no depletion and values near 0 = inside a gap.
 */
export function kirkwoodWeight(a: number): number {
	let weight = 1.0;
	for (const [center, halfWidth, depth] of KIRKWOOD_GAPS) {
		const dist = (a - center) / halfWidth;
		weight *= 1.0 - depth * Math.exp(-0.5 * dist * dist);
	}
	return weight;
}

// ---------------------------------------------------------------------------
// Default configurations
// ---------------------------------------------------------------------------

const DEFAULT_ASTEROID_BELT: BeltConfig = {
	particleCount: 10_000,
	innerRadiusAU: 2.2,
	outerRadiusAU: 3.2,
	maxEccentricity: 0.15,
	maxInclinationRad: 0.35, // ~20°
	baseSize: 0.003,
	sizeVariation: 2.0,
	color: [0.6, 0.55, 0.45], // rocky gray-brown
	opacity: 0.6
};

const DEFAULT_KUIPER_BELT: BeltConfig = {
	particleCount: 5_000,
	innerRadiusAU: 30,
	outerRadiusAU: 50,
	maxEccentricity: 0.12,
	maxInclinationRad: 0.52, // ~30°
	baseSize: 0.02,
	sizeVariation: 2.5,
	color: [0.45, 0.50, 0.58], // icy blue-gray
	opacity: 0.4
};

// ---------------------------------------------------------------------------
// Position generation
// ---------------------------------------------------------------------------

/**
 * Seeded PRNG (Mulberry32) for reproducible belt generation.
 * Avoids different particle layouts on each reload.
 */
function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generate particle positions for a belt using Keplerian orbit sampling.
 *
 * Each particle is placed on a random Keplerian orbit with:
 * - Semi-major axis sampled uniformly in [innerRadius, outerRadius] with rejection sampling for Kirkwood gaps
 * - Eccentricity sampled uniformly in [0, maxEccentricity]
 * - Inclination sampled from Rayleigh distribution (sin(i) weighting)
 * - RAAN, argument of periapsis, and true anomaly sampled uniformly in [0, 2π]
 *
 * @returns Float32Array of [x, y, z, ...] positions in AU
 */
export function generateBeltPositions(
	config: BeltConfig,
	useKirkwoodGaps: boolean,
	seed = 42
): { positions: Float32Array; sizes: Float32Array } {
	const rng = mulberry32(seed);
	const { particleCount, innerRadiusAU, outerRadiusAU, maxEccentricity, maxInclinationRad } = config;
	const positions = new Float32Array(particleCount * 3);
	const sizes = new Float32Array(particleCount);
	const TWO_PI = 2 * Math.PI;
	const range = outerRadiusAU - innerRadiusAU;

	let placed = 0;
	while (placed < particleCount) {
		// Sample semi-major axis with rejection sampling for Kirkwood gaps
		const a = innerRadiusAU + rng() * range;

		if (useKirkwoodGaps) {
			const weight = kirkwoodWeight(a);
			if (rng() > weight) continue; // reject — inside a gap
		}

		// Orbital elements
		const e = rng() * maxEccentricity;
		// Rayleigh-distributed inclination: i = σ * sqrt(-2 ln(1-u))
		const sigma = maxInclinationRad / 2.0;
		const inc = sigma * Math.sqrt(-2 * Math.log(1 - rng() * 0.999));
		const raan = rng() * TWO_PI;
		const argp = rng() * TWO_PI;
		const nu = rng() * TWO_PI;

		// Keplerian position in orbital plane
		const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
		const xOrb = r * Math.cos(nu);
		const yOrb = r * Math.sin(nu);

		// Rotate from orbital plane to ecliptic frame
		// R = R_z(-RAAN) * R_x(-inc) * R_z(-argp)
		const cosRaan = Math.cos(raan);
		const sinRaan = Math.sin(raan);
		const cosInc = Math.cos(inc);
		const sinInc = Math.sin(inc);
		const cosArgp = Math.cos(argp);
		const sinArgp = Math.sin(argp);

		// Combined rotation matrix elements (standard aerospace convention)
		const px = cosRaan * cosArgp - sinRaan * sinArgp * cosInc;
		const py = sinRaan * cosArgp + cosRaan * sinArgp * cosInc;
		const pz = sinArgp * sinInc;

		const qx = -cosRaan * sinArgp - sinRaan * cosArgp * cosInc;
		const qy = -sinRaan * sinArgp + cosRaan * cosArgp * cosInc;
		const qz = cosArgp * sinInc;

		const idx = placed * 3;
		positions[idx] = px * xOrb + qx * yOrb;
		positions[idx + 1] = py * xOrb + qy * yOrb;
		positions[idx + 2] = pz * xOrb + qz * yOrb;

		// Size variation: power-law distribution (more small particles)
		sizes[placed] = config.baseSize * (0.3 + Math.pow(rng(), 2) * config.sizeVariation);

		placed++;
	}

	return { positions, sizes };
}

// ---------------------------------------------------------------------------
// Belt renderer
// ---------------------------------------------------------------------------

/** Runtime state for a single belt (asteroid or Kuiper). */
interface BeltState {
	sprite: Sprite;
	material: PointsNodeMaterial;
	config: BeltConfig;
}

/**
 * GPU-instanced particle cloud renderer for asteroid and Kuiper belts.
 *
 * Usage:
 * ```ts
 * const belts = new BeltRenderer();
 * belts.addTo(scene);
 * // Belts are static — no per-frame update needed.
 * ```
 */
export class BeltRenderer {
	private asteroidBelt: BeltState | null = null;
	private kuiperBelt: BeltState | null = null;

	constructor(options: BeltRendererOptions = {}) {
		const asteroidConfig = { ...DEFAULT_ASTEROID_BELT, ...options.asteroidBelt };
		const kuiperConfig = { ...DEFAULT_KUIPER_BELT, ...options.kuiperBelt };

		this.asteroidBelt = this.buildBelt(asteroidConfig, true, 42);
		this.kuiperBelt = this.buildBelt(kuiperConfig, false, 137);
	}

	private buildBelt(config: BeltConfig, useKirkwoodGaps: boolean, seed: number): BeltState {
		const { positions, sizes } = generateBeltPositions(config, useKirkwoodGaps, seed);

		// Create instanced buffer attributes
		const positionAttr = new InstancedBufferAttribute(positions, 3);
		const sizeAttr = new InstancedBufferAttribute(sizes, 1);

		// TSL node references
		const instancePosition = vec3(instancedBufferAttribute(positionAttr));
		const instanceSize = float(instancedBufferAttribute(sizeAttr));

		const [r, g, b] = config.color;
		const baseColor = vec3(r, g, b);
		const baseOpacity = float(config.opacity);

		const material = new PointsNodeMaterial({
			sizeAttenuation: true,
			depthWrite: false,
			transparent: true,
			alphaTest: 0.02
		});

		material.positionNode = instancePosition;
		material.sizeNode = instanceSize;
		material.colorNode = baseColor;

		// Soft circular falloff
		material.opacityNode = /* @__PURE__ */ Fn(() => {
			const center = vec2(0.5);
			const dist = uv().sub(center).length().mul(2.0);
			const circleMask = smoothstep(1.0, 0.5, dist);
			return circleMask.mul(baseOpacity);
		})();

		const sprite = new Sprite(material);
		sprite.count = config.particleCount;
		sprite.frustumCulled = false;

		return { sprite, material, config };
	}

	/** Add both belts to a scene (typically the near scene). */
	addTo(scene: Scene): void {
		if (this.asteroidBelt) scene.add(this.asteroidBelt.sprite);
		if (this.kuiperBelt) scene.add(this.kuiperBelt.sprite);
	}

	/** Remove both belts from a scene. */
	removeFrom(scene: Scene): void {
		if (this.asteroidBelt) scene.remove(this.asteroidBelt.sprite);
		if (this.kuiperBelt) scene.remove(this.kuiperBelt.sprite);
	}

	/** Set visibility of the asteroid belt. */
	setAsteroidBeltVisible(visible: boolean): void {
		if (this.asteroidBelt) this.asteroidBelt.sprite.visible = visible;
	}

	/** Set visibility of the Kuiper belt. */
	setKuiperBeltVisible(visible: boolean): void {
		if (this.kuiperBelt) this.kuiperBelt.sprite.visible = visible;
	}

	/** Get the asteroid belt sprite (for external inspection/testing). */
	get asteroidSprite(): Sprite | null {
		return this.asteroidBelt?.sprite ?? null;
	}

	/** Get the Kuiper belt sprite (for external inspection/testing). */
	get kuiperSprite(): Sprite | null {
		return this.kuiperBelt?.sprite ?? null;
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		if (this.asteroidBelt) {
			this.asteroidBelt.sprite.removeFromParent();
			this.asteroidBelt.material.dispose();
			this.asteroidBelt = null;
		}
		if (this.kuiperBelt) {
			this.kuiperBelt.sprite.removeFromParent();
			this.kuiperBelt.material.dispose();
			this.kuiperBelt = null;
		}
	}
}
