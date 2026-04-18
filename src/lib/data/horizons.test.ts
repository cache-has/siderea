import { describe, it, expect } from 'vitest';
import {
	naifIdToHorizonsCommand,
	buildHorizonsUrl,
	parseHorizonsVectors,
	parseHorizonsResult
} from './horizons';

// ---------------------------------------------------------------------------
// NAIF ID mapping
// ---------------------------------------------------------------------------

describe('naifIdToHorizonsCommand', () => {
	it('maps Sun (0) to 10', () => {
		expect(naifIdToHorizonsCommand(0)).toBe('10');
	});

	it('maps planets 1-8 to body centers (x99)', () => {
		expect(naifIdToHorizonsCommand(1)).toBe('199');  // Mercury
		expect(naifIdToHorizonsCommand(3)).toBe('399');  // Earth
		expect(naifIdToHorizonsCommand(8)).toBe('899');  // Neptune
	});

	it('maps Pluto (9) to 999', () => {
		expect(naifIdToHorizonsCommand(9)).toBe('999');
	});

	it('maps dwarf planets to JPL IDs', () => {
		expect(naifIdToHorizonsCommand(10)).toBe('2000001'); // Ceres
		expect(naifIdToHorizonsCommand(11)).toBe('136199');  // Eris
	});

	it('maps moons directly (3-digit codes)', () => {
		expect(naifIdToHorizonsCommand(301)).toBe('301');  // Moon
		expect(naifIdToHorizonsCommand(501)).toBe('501');  // Io
		expect(naifIdToHorizonsCommand(606)).toBe('606');  // Titan
	});

	it('maps comets to DES= strings', () => {
		expect(naifIdToHorizonsCommand(1001)).toBe('DES=1P');
		expect(naifIdToHorizonsCommand(1002)).toBe('DES=C/1995 O1');
	});

	it('maps asteroids to JPL IDs', () => {
		expect(naifIdToHorizonsCommand(2001)).toBe('2000004'); // 4 Vesta
		expect(naifIdToHorizonsCommand(2002)).toBe('2000002'); // 2 Pallas
	});

	it('maps KBOs to JPL IDs', () => {
		expect(naifIdToHorizonsCommand(3001)).toBe('50000');  // Quaoar
		expect(naifIdToHorizonsCommand(3002)).toBe('90377');  // Sedna
	});

	it('returns null for unknown IDs', () => {
		expect(naifIdToHorizonsCommand(99999)).toBeNull();
		expect(naifIdToHorizonsCommand(-1)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

describe('buildHorizonsUrl', () => {
	it('builds a valid URL with required parameters', () => {
		const url = buildHorizonsUrl(3, '2024-01-01 00:00:00', '2024-01-01 00:01:00', '/test');
		expect(url).toContain('/test?');
		expect(url).toContain('COMMAND=');
		expect(url).toContain('399');
		expect(url).toContain('EPHEM_TYPE=VECTORS');
		expect(url).toContain('format=json');
	});

	it('throws for unmapped naif_id', () => {
		expect(() => buildHorizonsUrl(99999, '2024-01-01', '2024-01-02', '/test'))
			.toThrow('No Horizons mapping for naif_id 99999');
	});
});

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

// Real-format test fixture (matches actual Horizons API output)
const FIXTURE_RESULT = `*******************************************************************************
Target body name: Earth (399)                     {source: DE441}
Center body name: Sun (10)                        {source: DE441}
*******************************************************************************
$$SOE
2460310.500000000 = A.D. 2024-Jan-01 00:00:00.0000 TDB
 X =-1.658512460341716E-01 Y = 9.692307824650869E-01 Z =-5.491524466498898E-05
 VX=-1.723488742014654E-02 VY=-2.960664209404894E-03 VZ= 6.839470754425655E-07
$$EOE
*******************************************************************************`;

const FIXTURE_MULTI = `*******************************************************************************
Target body name: Mars (499)                      {source: DE441}
Center body name: Sun (10)                        {source: DE441}
*******************************************************************************
$$SOE
2460310.500000000 = A.D. 2024-Jan-01 00:00:00.0000 TDB
 X = 1.000000000000000E+00 Y = 2.000000000000000E+00 Z = 3.000000000000000E-01
 VX= 1.100000000000000E-02 VY= 2.200000000000000E-03 VZ= 3.300000000000000E-04
2460311.500000000 = A.D. 2024-Jan-02 00:00:00.0000 TDB
 X = 1.100000000000000E+00 Y = 2.100000000000000E+00 Z = 3.100000000000000E-01
 VX= 1.200000000000000E-02 VY= 2.300000000000000E-03 VZ= 3.400000000000000E-04
$$EOE
*******************************************************************************`;

describe('parseHorizonsVectors', () => {
	it('parses a single state vector block', () => {
		const block = `2460310.500000000 = A.D. 2024-Jan-01 00:00:00.0000 TDB
 X =-1.658512460341716E-01 Y = 9.692307824650869E-01 Z =-5.491524466498898E-05
 VX=-1.723488742014654E-02 VY=-2.960664209404894E-03 VZ= 6.839470754425655E-07`;

		const vectors = parseHorizonsVectors(block);
		expect(vectors).toHaveLength(1);

		const v = vectors[0];
		expect(v.jdTdb).toBeCloseTo(2460310.5, 1);
		expect(v.epoch).toContain('2024-Jan-01');
		expect(v.position.x).toBeCloseTo(-0.16585, 4);
		expect(v.position.y).toBeCloseTo(0.96923, 4);
		expect(v.position.z).toBeCloseTo(-5.49152e-5, 8);
		expect(v.velocity.vx).toBeCloseTo(-0.01723, 4);
		expect(v.velocity.vy).toBeCloseTo(-0.002961, 5);
		expect(v.velocity.vz).toBeCloseTo(6.839e-7, 10);
	});

	it('returns empty array for empty input', () => {
		expect(parseHorizonsVectors('')).toEqual([]);
		expect(parseHorizonsVectors('   ')).toEqual([]);
	});

	it('parses multiple state vectors', () => {
		const soeIdx = FIXTURE_MULTI.indexOf('$$SOE') + 5;
		const eoeIdx = FIXTURE_MULTI.indexOf('$$EOE');
		const block = FIXTURE_MULTI.substring(soeIdx, eoeIdx).trim();

		const vectors = parseHorizonsVectors(block);
		expect(vectors).toHaveLength(2);
		expect(vectors[0].jdTdb).toBeCloseTo(2460310.5, 1);
		expect(vectors[1].jdTdb).toBeCloseTo(2460311.5, 1);
		expect(vectors[1].position.x).toBeCloseTo(1.1, 1);
	});
});

describe('parseHorizonsResult', () => {
	it('extracts target and center names', () => {
		const result = parseHorizonsResult(FIXTURE_RESULT);
		expect(result.targetName).toBe('Earth');
		expect(result.centerName).toBe('Sun');
	});

	it('parses vectors from the full result', () => {
		const result = parseHorizonsResult(FIXTURE_RESULT);
		expect(result.vectors).toHaveLength(1);
		expect(result.vectors[0].position.x).toBeCloseTo(-0.16585, 4);
	});

	it('throws when $$SOE/$$EOE markers are missing', () => {
		expect(() => parseHorizonsResult('no markers here'))
			.toThrow('No ephemeris data found');
	});

	it('parses multi-step results', () => {
		const result = parseHorizonsResult(FIXTURE_MULTI);
		expect(result.targetName).toBe('Mars');
		expect(result.vectors).toHaveLength(2);
	});
});
