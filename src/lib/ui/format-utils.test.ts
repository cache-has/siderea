import { describe, it, expect, afterEach } from 'vitest';
import { formatDistanceAU, setDefaultUnit } from './format-utils';

describe('formatDistanceAU', () => {
	afterEach(() => setDefaultUnit('auto'));
	it('formats sub-AU distances in km', () => {
		expect(formatDistanceAU(0.0001)).toMatch(/km$/);
	});

	it('formats medium distances in M km', () => {
		expect(formatDistanceAU(0.01)).toMatch(/M km$/);
	});

	it('formats solar-system distances in AU', () => {
		expect(formatDistanceAU(1)).toMatch(/AU$/);
		expect(formatDistanceAU(5.2)).toMatch(/AU$/);
	});

	it('formats stellar distances in ly', () => {
		// Proxima Centauri ~1.3 pc = ~268,000 AU
		expect(formatDistanceAU(268000)).toMatch(/ly$/);
	});

	it('formats galactic distances in kly', () => {
		// 10,000 ly = ~632M AU
		expect(formatDistanceAU(632_410_770)).toMatch(/kly$/);
	});

	it('returns reasonable values', () => {
		expect(formatDistanceAU(0.00001)).toBe('1,496 km');
		expect(formatDistanceAU(1)).toBe('1.000 AU');
	});

	it('respects explicit unit override', () => {
		expect(formatDistanceAU(1, 'km')).toMatch(/km$/);
		expect(formatDistanceAU(0.0001, 'AU')).toMatch(/AU$/);
		expect(formatDistanceAU(1, 'ly')).toMatch(/ly$/);
		expect(formatDistanceAU(1, 'pc')).toMatch(/pc$/);
	});

	it('respects module-level default unit', () => {
		setDefaultUnit('AU');
		expect(formatDistanceAU(0.0001)).toMatch(/AU$/); // would normally be km
		setDefaultUnit('km');
		expect(formatDistanceAU(5)).toMatch(/km$/); // would normally be AU
	});

	it('explicit unit overrides default', () => {
		setDefaultUnit('km');
		expect(formatDistanceAU(1, 'AU')).toMatch(/AU$/);
	});
});
