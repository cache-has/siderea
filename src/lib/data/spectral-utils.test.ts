import { describe, it, expect } from 'vitest';
import {
	parseSpectralType,
	estimateStellarProperties,
	bvToTemperature,
	formatDistance
} from './spectral-utils';

describe('parseSpectralType', () => {
	it('parses main-sequence star "G2V"', () => {
		const info = parseSpectralType('G2V');
		expect(info).not.toBeNull();
		expect(info!.spectralClass).toBe('G');
		expect(info!.subclass).toBe(2);
		expect(info!.luminosityClass).toBe('V');
		expect(info!.luminosityLabel).toBe('Main sequence');
	});

	it('parses giant star "K0III"', () => {
		const info = parseSpectralType('K0III');
		expect(info).not.toBeNull();
		expect(info!.spectralClass).toBe('K');
		expect(info!.luminosityClass).toBe('III');
		expect(info!.luminosityLabel).toBe('Giant');
	});

	it('parses subgiant "B2IV"', () => {
		const info = parseSpectralType('B2IV');
		expect(info).not.toBeNull();
		expect(info!.spectralClass).toBe('B');
		expect(info!.subclass).toBe(2);
		expect(info!.luminosityClass).toBe('IV');
	});

	it('parses spectral type with peculiarity suffix "B9p"', () => {
		const info = parseSpectralType('B9p');
		expect(info).not.toBeNull();
		expect(info!.spectralClass).toBe('B');
		expect(info!.subclass).toBe(9);
		// 'p' is not a luminosity class, defaults to V
		expect(info!.luminosityClass).toBe('V');
	});

	it('returns null for empty string', () => {
		expect(parseSpectralType('')).toBeNull();
	});

	it('returns null for unparseable string', () => {
		expect(parseSpectralType('DA2')).toBeNull(); // white dwarf
	});
});

describe('estimateStellarProperties', () => {
	it('estimates Sun-like star (G2V)', () => {
		const est = estimateStellarProperties('G2V');
		expect(est).not.toBeNull();
		// Sun: ~5770K, ~1.0 solar mass, ~1.0 solar radius
		expect(est!.temperature_K).toBeGreaterThan(5500);
		expect(est!.temperature_K).toBeLessThan(6000);
		expect(est!.mass_solar).toBeGreaterThan(0.8);
		expect(est!.mass_solar).toBeLessThan(1.2);
		expect(est!.radius_solar).toBeGreaterThan(0.8);
		expect(est!.radius_solar).toBeLessThan(1.2);
	});

	it('estimates hot O-type star has high temperature', () => {
		const est = estimateStellarProperties('O5V');
		expect(est).not.toBeNull();
		expect(est!.temperature_K).toBeGreaterThan(30000);
	});

	it('estimates cool M-type star has low temperature', () => {
		const est = estimateStellarProperties('M5V');
		expect(est).not.toBeNull();
		expect(est!.temperature_K).toBeLessThan(3500);
		expect(est!.mass_solar).toBeLessThan(0.3);
	});

	it('giant has larger radius than main sequence', () => {
		const ms = estimateStellarProperties('K0V');
		const giant = estimateStellarProperties('K0III');
		expect(ms).not.toBeNull();
		expect(giant).not.toBeNull();
		expect(giant!.radius_solar).toBeGreaterThan(ms!.radius_solar * 5);
	});
});

describe('bvToTemperature', () => {
	it('returns ~5770K for Sun-like B-V (0.65)', () => {
		const temp = bvToTemperature(0.65);
		expect(temp).toBeGreaterThan(5500);
		expect(temp).toBeLessThan(6100);
	});

	it('hotter stars have negative B-V', () => {
		const hot = bvToTemperature(-0.3);
		const cool = bvToTemperature(1.5);
		expect(hot).toBeGreaterThan(cool);
	});
});

describe('formatDistance', () => {
	it('formats nearby star', () => {
		expect(formatDistance(1.3)).toContain('pc');
		expect(formatDistance(1.3)).toContain('ly');
	});

	it('formats distant star', () => {
		const str = formatDistance(2300);
		expect(str).toContain('2300 pc');
	});

	it('handles zero distance', () => {
		expect(formatDistance(0)).toBe('N/A');
	});
});
