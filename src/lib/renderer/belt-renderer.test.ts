import { describe, it, expect } from 'vitest';
import { Scene, Sprite } from 'three/webgpu';
import { BeltRenderer, generateBeltPositions, kirkwoodWeight } from './belt-renderer';
import type { BeltConfig } from './belt-renderer';

const SMALL_BELT: BeltConfig = {
	particleCount: 100,
	innerRadiusAU: 2.2,
	outerRadiusAU: 3.2,
	maxEccentricity: 0.15,
	maxInclinationRad: 0.35,
	baseSize: 0.003,
	sizeVariation: 2.0,
	color: [0.6, 0.55, 0.45],
	opacity: 0.6
};

describe('kirkwoodWeight', () => {
	it('returns ~1 far from gaps', () => {
		// 2.35 AU is between 4:1 (2.06) and 3:1 (2.50) gaps
		expect(kirkwoodWeight(2.35)).toBeGreaterThan(0.95);
	});

	it('returns low value at 3:1 resonance (2.50 AU)', () => {
		expect(kirkwoodWeight(2.50)).toBeLessThan(0.15);
	});

	it('returns low value at 2:1 resonance (3.27 AU)', () => {
		expect(kirkwoodWeight(3.27)).toBeLessThan(0.20);
	});

	it('returns ~1 outside belt range', () => {
		expect(kirkwoodWeight(1.0)).toBeGreaterThan(0.99);
		expect(kirkwoodWeight(5.0)).toBeGreaterThan(0.99);
	});
});

describe('generateBeltPositions', () => {
	it('generates correct number of particles', () => {
		const { positions, sizes } = generateBeltPositions(SMALL_BELT, true);
		expect(positions.length).toBe(100 * 3);
		expect(sizes.length).toBe(100);
	});

	it('produces deterministic output with same seed', () => {
		const a = generateBeltPositions(SMALL_BELT, true, 42);
		const b = generateBeltPositions(SMALL_BELT, true, 42);
		expect(a.positions).toEqual(b.positions);
		expect(a.sizes).toEqual(b.sizes);
	});

	it('produces different output with different seeds', () => {
		const a = generateBeltPositions(SMALL_BELT, true, 42);
		const b = generateBeltPositions(SMALL_BELT, true, 99);
		expect(a.positions).not.toEqual(b.positions);
	});

	it('all positions are within expected radial range', () => {
		const config: BeltConfig = {
			...SMALL_BELT,
			particleCount: 500,
			maxEccentricity: 0.0 // circular orbits — radius = semi-major axis
		};
		const { positions } = generateBeltPositions(config, false);

		for (let i = 0; i < config.particleCount; i++) {
			const x = positions[i * 3];
			const y = positions[i * 3 + 1];
			const z = positions[i * 3 + 2];
			const r = Math.sqrt(x * x + y * y + z * z);
			expect(r).toBeGreaterThan(config.innerRadiusAU * 0.9);
			expect(r).toBeLessThan(config.outerRadiusAU * 1.1);
		}
	});

	it('Kirkwood gaps deplete particles at resonance locations', () => {
		const config: BeltConfig = {
			...SMALL_BELT,
			particleCount: 5000,
			maxEccentricity: 0.01 // near-circular to isolate radial distribution
		};
		const { positions } = generateBeltPositions(config, true);

		// Count particles near the 3:1 gap (2.50 AU) vs away from it (2.35 AU)
		let gapCount = 0;
		let normalCount = 0;
		for (let i = 0; i < config.particleCount; i++) {
			const x = positions[i * 3];
			const y = positions[i * 3 + 1];
			const z = positions[i * 3 + 2];
			const r = Math.sqrt(x * x + y * y + z * z);
			if (r > 2.46 && r < 2.54) gapCount++;
			if (r > 2.31 && r < 2.39) normalCount++;
		}

		// The gap region should have significantly fewer particles
		expect(gapCount).toBeLessThan(normalCount * 0.5);
	});

	it('all sizes are positive', () => {
		const { sizes } = generateBeltPositions(SMALL_BELT, true);
		for (let i = 0; i < sizes.length; i++) {
			expect(sizes[i]).toBeGreaterThan(0);
		}
	});
});

describe('BeltRenderer', () => {
	it('creates both asteroid and Kuiper belt sprites', () => {
		const renderer = new BeltRenderer({
			asteroidBelt: { particleCount: 50 },
			kuiperBelt: { particleCount: 30 }
		});

		expect(renderer.asteroidSprite).toBeInstanceOf(Sprite);
		expect(renderer.kuiperSprite).toBeInstanceOf(Sprite);
		expect(renderer.asteroidSprite!.count).toBe(50);
		expect(renderer.kuiperSprite!.count).toBe(30);
		renderer.dispose();
	});

	it('adds and removes sprites from scene', () => {
		const renderer = new BeltRenderer({
			asteroidBelt: { particleCount: 10 },
			kuiperBelt: { particleCount: 10 }
		});
		const scene = new Scene();

		renderer.addTo(scene);
		expect(scene.children.length).toBe(2);

		renderer.removeFrom(scene);
		expect(scene.children.length).toBe(0);
		renderer.dispose();
	});

	it('toggles belt visibility', () => {
		const renderer = new BeltRenderer({
			asteroidBelt: { particleCount: 10 },
			kuiperBelt: { particleCount: 10 }
		});

		renderer.setAsteroidBeltVisible(false);
		expect(renderer.asteroidSprite!.visible).toBe(false);
		expect(renderer.kuiperSprite!.visible).toBe(true);

		renderer.setKuiperBeltVisible(false);
		expect(renderer.kuiperSprite!.visible).toBe(false);
		renderer.dispose();
	});

	it('dispose cleans up', () => {
		const renderer = new BeltRenderer({
			asteroidBelt: { particleCount: 10 },
			kuiperBelt: { particleCount: 10 }
		});
		const scene = new Scene();
		renderer.addTo(scene);

		renderer.dispose();
		expect(renderer.asteroidSprite).toBeNull();
		expect(renderer.kuiperSprite).toBeNull();
		expect(scene.children.length).toBe(0);
	});
});
