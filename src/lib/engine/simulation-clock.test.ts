import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationClock, TIME_SCALE_PRESETS, SIM_DATE_MIN, SIM_DATE_MAX } from './simulation-clock';

describe('SimulationClock', () => {
	let clock: SimulationClock;

	beforeEach(() => {
		clock = new SimulationClock();
	});

	it('starts at approximately the current JD', () => {
		const expectedJD = 2440587.5 + Date.now() / 86_400_000;
		expect(clock.jd).toBeCloseTo(expectedJD, 4);
	});

	it('advances by delta * timeScale each tick', () => {
		const startJD = clock.jd;
		clock.tick(1.0); // 1 second at 1x
		const advancedJD = clock.jd;
		const expectedAdvance = 1.0 / 86_400; // 1 second in days
		expect(advancedJD - startJD).toBeCloseTo(expectedAdvance, 8);
	});

	it('respects time scale', () => {
		const startJD = clock.jd;
		clock.timeScale = 1000;
		clock.tick(1.0); // 1 second at 1000x = 1000 sim-seconds
		const advance = clock.jd - startJD;
		const expected = 1000 / 86_400;
		expect(advance).toBeCloseTo(expected, 8);
	});

	it('does not advance when paused', () => {
		const startJD = clock.jd;
		clock.paused = true;
		clock.tick(10.0);
		expect(clock.jd).toBe(startJD);
	});

	it('toggles pause', () => {
		expect(clock.paused).toBe(false);
		clock.togglePause();
		expect(clock.paused).toBe(true);
		clock.togglePause();
		expect(clock.paused).toBe(false);
	});

	it('resets to current time and 1x', () => {
		clock.timeScale = 10000;
		clock.tick(100);
		const drifted = clock.jd;
		clock.reset();
		expect(clock.timeScale).toBe(1);
		expect(clock.paused).toBe(false);
		// JD should be back near current
		const expectedJD = 2440587.5 + Date.now() / 86_400_000;
		expect(clock.jd).toBeCloseTo(expectedJD, 4);
	});

	it('setJD/setDate work correctly', () => {
		const target = 2451545.0; // J2000
		clock.setJD(target);
		expect(clock.jd).toBe(target);

		const date = new Date('2024-01-01T00:00:00Z');
		clock.setDate(date);
		expect(clock.date.toISOString().slice(0, 10)).toBe('2024-01-01');
	});

	it('isAccelerated reflects time scale > 1', () => {
		expect(clock.isAccelerated).toBe(false);
		clock.timeScale = 10;
		expect(clock.isAccelerated).toBe(true);
		clock.timeScale = 1;
		expect(clock.isAccelerated).toBe(false);
	});

	it('dateString formats as YYYY-MM-DD', () => {
		clock.setDate(new Date('2024-06-15T12:00:00Z'));
		expect(clock.dateString).toBe('2024-06-15');
	});

	it('exports TIME_SCALE_PRESETS', () => {
		expect(TIME_SCALE_PRESETS).toContain(1);
		expect(TIME_SCALE_PRESETS).toContain(10000);
		expect(TIME_SCALE_PRESETS.length).toBeGreaterThan(3);
	});

	it('clamps setDate to valid range', () => {
		clock.setDate(new Date('1800-01-01T00:00:00Z'));
		expect(clock.date.getTime()).toBeGreaterThanOrEqual(SIM_DATE_MIN.getTime());

		clock.setDate(new Date('2300-01-01T00:00:00Z'));
		expect(clock.date.getTime()).toBeLessThanOrEqual(SIM_DATE_MAX.getTime());
	});

	it('clamps setJD to valid range', () => {
		clock.setJD(0); // way before 1900
		expect(clock.date.getUTCFullYear()).toBeGreaterThanOrEqual(1900);

		clock.setJD(3000000); // way after 2200
		expect(clock.date.getUTCFullYear()).toBeLessThanOrEqual(2200);
	});

	it('auto-pauses when tick hits boundary', () => {
		clock.setDate(new Date('2200-12-31T23:59:00Z'));
		clock.timeScale = 1_000_000;
		clock.tick(100); // would overshoot
		expect(clock.paused).toBe(true);
		expect(clock.date.getTime()).toBeLessThanOrEqual(SIM_DATE_MAX.getTime());
	});
});
