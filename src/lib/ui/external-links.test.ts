import { describe, it, expect } from 'vitest';
import {
	starLinks,
	bodyLinks,
	satelliteLinks,
	nebulaLinks,
	clusterLinks,
	blackholeLinks
} from './external-links';
import type {
	NotableStar,
	SolarSystemBody,
	Satellite,
	NebulaNO,
	ClusterNO,
	BlackholeNO
} from '$lib/data/types';

const makeStar = (overrides: Partial<NotableStar> = {}): NotableStar => ({
	index: 0, name: 'Sirius', spectral: 'A1V', constellation: 'CMa',
	ra: 6.75, dec: -16.72, dist: 2.64, mag: -1.46, absmag: 1.42, bv: 0.0,
	...overrides
});

const makeBody = (overrides: Partial<SolarSystemBody> = {}): SolarSystemBody => ({
	id: 'mars', name: 'Mars', naif_id: 4, type: 'planet', parent_id: 'sun',
	mass_kg: 6.4e23, radius_km: 3390, radius_mean_km: 3390, axial_tilt_deg: 25.2,
	rotation_period_hours: 24.6, surface_gravity_m_s2: 3.72, orbital_period_days: 687,
	atmosphere: null, rings: null, notable_features: [], description: '', texture_ref: null,
	...overrides
});

describe('starLinks', () => {
	it('returns Wikipedia link for all stars', () => {
		const links = starLinks(makeStar());
		expect(links.some(l => l.label === 'Wikipedia')).toBe(true);
		expect(links[0].url).toContain('en.wikipedia.org/wiki/Sirius');
	});

	it('returns SIMBAD link when HIP ID is present', () => {
		const links = starLinks(makeStar({ hip: 32349 }));
		expect(links.some(l => l.label === 'SIMBAD')).toBe(true);
		expect(links.find(l => l.label === 'SIMBAD')!.url).toContain('HIP');
	});

	it('omits SIMBAD link when no HIP ID', () => {
		const links = starLinks(makeStar());
		expect(links.some(l => l.label === 'SIMBAD')).toBe(false);
	});
});

describe('bodyLinks', () => {
	it('returns Wikipedia and NASA for planets', () => {
		const links = bodyLinks(makeBody());
		expect(links.map(l => l.label)).toEqual(['Wikipedia', 'NASA']);
		expect(links[1].url).toContain('solarsystem.nasa.gov/planets/mars');
	});

	it('handles the Sun correctly', () => {
		const links = bodyLinks(makeBody({ id: 'sun', name: 'Sun', type: 'star' }));
		expect(links.find(l => l.label === 'NASA')!.url).toBe('https://solarsystem.nasa.gov/sun/overview/');
	});

	it('handles moons', () => {
		const links = bodyLinks(makeBody({ id: 'moon', name: 'Moon', type: 'moon' }));
		expect(links.find(l => l.label === 'NASA')!.url).toContain('moons/earths-moon');
	});

	it('handles dwarf planets', () => {
		const links = bodyLinks(makeBody({ id: 'pluto', name: 'Pluto', type: 'dwarf_planet' }));
		expect(links.find(l => l.label === 'NASA')!.url).toContain('dwarf-planets/pluto');
	});
});

describe('satelliteLinks', () => {
	it('returns Wikipedia link', () => {
		const sat = { id: 'iss', name: 'International Space Station' } as Satellite;
		const links = satelliteLinks(sat);
		expect(links[0].url).toContain('International_Space_Station');
	});
});

describe('nebulaLinks', () => {
	it('returns Wikipedia and SIMBAD', () => {
		const nebula = { name: 'Orion Nebula', catalog_ids: ['M42', 'NGC 1976'] } as NebulaNO;
		const links = nebulaLinks(nebula);
		expect(links.map(l => l.label)).toEqual(['Wikipedia', 'SIMBAD']);
		expect(links[1].url).toContain('M42');
	});
});

describe('clusterLinks', () => {
	it('returns Wikipedia and SIMBAD', () => {
		const cluster = { name: 'Pleiades', catalog_ids: ['M45'] } as ClusterNO;
		const links = clusterLinks(cluster);
		expect(links.map(l => l.label)).toEqual(['Wikipedia', 'SIMBAD']);
	});
});

describe('blackholeLinks', () => {
	it('returns Wikipedia and SIMBAD', () => {
		const bh = { name: 'Sagittarius A*', catalog_ids: ['Sgr A*'] } as BlackholeNO;
		const links = blackholeLinks(bh);
		expect(links[0].url).toContain('Sagittarius_A');
		expect(links[1].url).toContain('Sgr');
	});
});
