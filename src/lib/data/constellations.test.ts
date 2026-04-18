import { describe, it, expect } from 'vitest';
import type { ConstellationData, Constellation } from './constellations';

/** Minimal test data matching the ConstellationData format. */
const MOCK_DATA: ConstellationData = {
	format_version: 1,
	coordinate_system: 'J2000 equatorial, parsecs',
	constellation_count: 2,
	total_line_segments: 4,
	constellations: [
		{
			id: 'Ori',
			name: 'Orion',
			lines: [
				[10, 20, 30, 40, 50, 60],
				[40, 50, 60, 70, 80, 90]
			],
			center: [40, 50, 60]
		},
		{
			id: 'Cru',
			name: 'Crux',
			lines: [
				[1, 2, 3, 4, 5, 6],
				[7, 8, 9, 10, 11, 12]
			],
			center: [5.5, 6.5, 7.5]
		}
	]
};

describe('ConstellationData', () => {
	it('has correct structure', () => {
		expect(MOCK_DATA.format_version).toBe(1);
		expect(MOCK_DATA.constellations).toHaveLength(2);
	});

	it('stores line segments as 6-element arrays', () => {
		const ori = MOCK_DATA.constellations[0];
		expect(ori.lines[0]).toHaveLength(6);
		expect(ori.lines[0][0]).toBe(10); // x1
		expect(ori.lines[0][3]).toBe(40); // x2
	});

	it('stores center positions as 3-element arrays', () => {
		const cru = MOCK_DATA.constellations[1];
		expect(cru.center).toHaveLength(3);
		expect(cru.center[0]).toBeCloseTo(5.5);
	});

	it('uses IAU abbreviations as IDs', () => {
		const ids = MOCK_DATA.constellations.map((c: Constellation) => c.id);
		expect(ids).toContain('Ori');
		expect(ids).toContain('Cru');
	});
});
