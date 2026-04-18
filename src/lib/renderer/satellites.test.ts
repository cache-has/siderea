import { describe, it, expect, vi } from 'vitest';
import { Scene, Sprite } from 'three/webgpu';
import { SatelliteRenderer, tleEpochToJD, generateConstellationPositions } from './satellites';
import { METERS_PER_AU } from './scale';
import type { Satellite } from '$lib/data/types';

/** Minimal satellite fixture. */
function makeSatellite(overrides: Partial<Satellite> = {}): Satellite {
	return {
		id: 'iss',
		name: 'International Space Station',
		subtype: 'space_station',
		orbit_type: 'tle',
		parent_id: 'earth',
		norad_id: 25544,
		heliocentric_state: null,
		lagrange_point: null,
		surface_marker: null,
		launch_date: '1998-11-20',
		mass_kg: 420000,
		description: 'ISS',
		stats: {},
		...overrides
	};
}

describe('tleEpochToJD', () => {
	it('parses a 2000s epoch correctly', () => {
		// "24001.50000000" = year 2024, day 1.5 (Jan 1 at noon)
		const line1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002';
		const jd = tleEpochToJD(line1);
		// JD of 2024-01-01 12:00 UTC ≈ 2460310.5 + 0.5 = 2460311.0
		// Actually JD of Jan 1.0 2024 = 2460310.5, so Jan 1.5 = 2460311.0
		expect(jd).toBeCloseTo(2460311.0, 0);
	});

	it('parses a 1900s epoch (year >= 57)', () => {
		// "57001.00000000" = year 1957, day 1.0
		const line1 = '1 00001U 57001A   57001.00000000  .00000000  00000-0  00000-0 0  0000';
		const jd = tleEpochToJD(line1);
		// JD of 1957-01-01 00:00 ≈ 2435839.5
		expect(jd).toBeCloseTo(2435839.5, 0);
	});
});

describe('generateConstellationPositions', () => {
	it('generates the correct number of positions', () => {
		const positions = generateConstellationPositions({
			altitudeKm: 550,
			inclinationDeg: 53,
			count: 100,
			planes: 20
		});
		expect(positions).toHaveLength(100);
	});

	it('places satellites at correct orbital radius', () => {
		const altKm = 550;
		const earthRadiusKm = 6371;
		const expectedRadiusKm = earthRadiusKm + altKm;

		const positions = generateConstellationPositions({
			altitudeKm: altKm,
			inclinationDeg: 0,
			count: 10,
			planes: 2
		});

		for (const pos of positions) {
			const radiusKm = pos.length();
			expect(radiusKm).toBeCloseTo(expectedRadiusKm, 0);
		}
	});

	it('respects inclination constraint', () => {
		const incDeg = 55;
		const positions = generateConstellationPositions({
			altitudeKm: 20200,
			inclinationDeg: incDeg,
			count: 31,
			planes: 6
		});

		const earthRadiusKm = 6371;
		const orbitRadiusKm = earthRadiusKm + 20200;

		for (const pos of positions) {
			// z/r = sin(latitude), max latitude ≤ inclination
			const lat = Math.asin(pos.z / orbitRadiusKm) * (180 / Math.PI);
			expect(Math.abs(lat)).toBeLessThanOrEqual(incDeg + 0.1);
		}
	});
});

describe('SatelliteRenderer', () => {
	it('creates sprites for renderable satellites', () => {
		const sats = [
			makeSatellite({ id: 'iss', orbit_type: 'tle', norad_id: 25544 }),
			makeSatellite({
				id: 'voyager_1', orbit_type: 'heliocentric', subtype: 'probe',
				norad_id: null,
				heliocentric_state: {
					epoch: '2024-01-01T00:00:00Z',
					x_au: -48.2, y_au: -140.8, z_au: 54.3,
					vx_au_day: 0, vy_au_day: -0.0093, vz_au_day: 0.0046
				}
			}),
			makeSatellite({
				id: 'jwst', orbit_type: 'lagrange', subtype: 'telescope',
				norad_id: null, lagrange_point: 'SEL2'
			})
		];

		const renderer = new SatelliteRenderer(sats);
		expect(renderer.satelliteIds).toContain('iss');
		expect(renderer.satelliteIds).toContain('voyager_1');
		expect(renderer.satelliteIds).toContain('jwst');
		expect(renderer.spriteCount).toBe(3);
		renderer.dispose();
	});

	it('skips surface markers and historical orbits', () => {
		const sats = [
			makeSatellite({ id: 'apollo_11', orbit_type: 'surface_marker', norad_id: null }),
			makeSatellite({ id: 'sputnik', orbit_type: 'historical_orbit', norad_id: null })
		];
		const renderer = new SatelliteRenderer(sats);
		expect(renderer.spriteCount).toBe(0);
		renderer.dispose();
	});

	it('creates constellation with many sprites', () => {
		const sats = [
			makeSatellite({
				id: 'starlink_representative', subtype: 'constellation',
				orbit_type: 'tle', norad_id: null
			})
		];
		const renderer = new SatelliteRenderer(sats);
		// Starlink generates 100 representative sprites
		expect(renderer.spriteCount).toBe(100);
		renderer.dispose();
	});

	it('adds and removes from scene', () => {
		const sats = [makeSatellite()];
		const renderer = new SatelliteRenderer(sats);
		const scene = new Scene();

		renderer.addTo(scene);
		expect(scene.children.length).toBe(1);

		renderer.removeFrom(scene);
		expect(scene.children.length).toBe(0);
		renderer.dispose();
	});

	it('updates heliocentric probe with linear propagation', () => {
		const sats = [
			makeSatellite({
				id: 'voyager_1', orbit_type: 'heliocentric', subtype: 'probe',
				norad_id: null,
				heliocentric_state: {
					epoch: '2024-01-01T00:00:00Z',
					x_au: 100, y_au: 0, z_au: 0,
					vx_au_day: 0.01, vy_au_day: 0, vz_au_day: 0
				}
			})
		];

		// Earth position (needed but not used for heliocentric)
		const earthPos = new Float64Array([METERS_PER_AU, 0, 0]);
		const wasm = {
			get_body_position: vi.fn().mockReturnValue(earthPos),
			propagate_tle: vi.fn(),
			transform_coordinates: vi.fn()
		};

		const renderer = new SatelliteRenderer(sats, { wasm });

		// 365 days after epoch: x should be ~100 + 0.01*365 = ~103.65
		const epochJd = 2460310.5; // 2024-01-01
		const jd = epochJd + 365;
		renderer.update(jd);

		const sprite = renderer.getSprite('voyager_1')!;
		expect(sprite.position.x).toBeCloseTo(103.65, 1);
		renderer.dispose();
	});

	it('dispose cleans up all resources', () => {
		const sats = [
			makeSatellite(),
			makeSatellite({
				id: 'starlink_representative', subtype: 'constellation',
				orbit_type: 'tle', norad_id: null
			})
		];
		const renderer = new SatelliteRenderer(sats);
		const scene = new Scene();
		renderer.addTo(scene);

		const initialChildren = scene.children.length;
		expect(initialChildren).toBe(101); // 1 individual + 100 constellation

		renderer.dispose();
		expect(renderer.spriteCount).toBe(0);
		expect(scene.children.length).toBe(0);
	});
});
