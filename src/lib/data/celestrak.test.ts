import { describe, it, expect } from 'vitest';
import {
	tleEpochToJD,
	parse3LE,
	isTleStale,
	formatTleAge
} from './celestrak';

// ---------------------------------------------------------------------------
// TLE epoch parsing
// ---------------------------------------------------------------------------

describe('tleEpochToJD', () => {
	it('parses a 2020s epoch correctly', () => {
		// "26092.13346771" = year 2026, day 92.13...
		const line1 = '1 25544U 98067A   26092.13346771  .00010892  00000+0  20755-3 0  9992';
		const jd = tleEpochToJD(line1);
		// JD of Jan 0.0 2026 = 2461040.5, + 92.13 ≈ 2461132.63
		expect(jd).toBeCloseTo(2461132.63, 0);
	});

	it('parses a 2024 epoch correctly', () => {
		// "24001.50000000" = year 2024, day 1.5
		const line1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002';
		const jd = tleEpochToJD(line1);
		// JD of 2024-01-01 12:00 ≈ 2460311.0
		expect(jd).toBeCloseTo(2460311.0, 0);
	});

	it('parses a 1900s epoch (year >= 57)', () => {
		const line1 = '1 00001U 57001A   57001.00000000  .00000000  00000-0  00000-0 0  0000';
		const jd = tleEpochToJD(line1);
		// JD of 1957-01-01 00:00 ≈ 2435839.5
		expect(jd).toBeCloseTo(2435839.5, 0);
	});
});

// ---------------------------------------------------------------------------
// 3LE parser
// ---------------------------------------------------------------------------

const ISS_3LE = `ISS (ZARYA)
1 25544U 98067A   26092.13346771  .00010892  00000+0  20755-3 0  9992
2 25544  51.6331 316.4579 0006239 262.1298  97.8982 15.48713693559960`;

const MULTI_3LE = `ISS (ZARYA)
1 25544U 98067A   26092.13346771  .00010892  00000+0  20755-3 0  9992
2 25544  51.6331 316.4579 0006239 262.1298  97.8982 15.48713693559960
HST
1 20580U 90037B   26092.10370228  .00009025  00000+0  29535-3 0  9998
2 20580  28.4722 240.2324 0002043  36.1686 323.9047 15.29860039776908`;

describe('parse3LE', () => {
	it('parses a single 3LE entry', () => {
		const tles = parse3LE(ISS_3LE);
		expect(tles).toHaveLength(1);
		expect(tles[0].name).toBe('ISS (ZARYA)');
		expect(tles[0].line1).toMatch(/^1 25544/);
		expect(tles[0].line2).toMatch(/^2 25544/);
		expect(tles[0].epochJd).toBeCloseTo(2461132.63, 0);
	});

	it('parses multiple 3LE entries', () => {
		const tles = parse3LE(MULTI_3LE);
		expect(tles).toHaveLength(2);
		expect(tles[0].name).toBe('ISS (ZARYA)');
		expect(tles[1].name).toBe('HST');
	});

	it('returns empty array for empty input', () => {
		expect(parse3LE('')).toEqual([]);
		expect(parse3LE('   ')).toEqual([]);
	});

	it('handles Windows-style line endings', () => {
		const windowsTle = ISS_3LE.replace(/\n/g, '\r\n');
		const tles = parse3LE(windowsTle);
		expect(tles).toHaveLength(1);
		expect(tles[0].name).toBe('ISS (ZARYA)');
	});

	it('skips malformed entries', () => {
		const bad = `Bad Name
Not a TLE line
Also not a TLE line`;
		const tles = parse3LE(bad);
		expect(tles).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

describe('isTleStale', () => {
	it('returns false for recently fetched data', () => {
		expect(isTleStale(Date.now())).toBe(false);
		expect(isTleStale(Date.now() - 1000)).toBe(false);
	});

	it('returns true for data older than 7 days', () => {
		const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
		expect(isTleStale(eightDaysAgo)).toBe(true);
	});
});

describe('formatTleAge', () => {
	it('formats recent fetches', () => {
		expect(formatTleAge(Date.now())).toBe('just now');
	});

	it('formats hours', () => {
		const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
		expect(formatTleAge(twoHoursAgo)).toBe('2h ago');
	});

	it('formats days', () => {
		const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
		expect(formatTleAge(threeDaysAgo)).toBe('3 days ago');
	});

	it('formats single day', () => {
		const oneDayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;
		expect(formatTleAge(oneDayAgo)).toBe('1 day ago');
	});
});
