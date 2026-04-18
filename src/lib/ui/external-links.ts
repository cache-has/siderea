/**
 * Generates external resource URLs for celestial objects.
 * All links open in new tabs — these are best-effort URLs that may 404
 * for obscure objects, which is acceptable for a "learn more" feature.
 */

import type {
	NotableStar,
	SolarSystemBody,
	Satellite,
	NebulaNO,
	ClusterNO,
	BlackholeNO
} from '$lib/data/types';

export interface ExternalLink {
	label: string;
	url: string;
}

function wikipediaUrl(title: string): string {
	return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function simbadUrl(identifier: string): string {
	return `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(identifier)}`;
}

/** NASA Solar System Exploration category slugs by body type. */
const NASA_CATEGORIES: Record<string, string> = {
	planet: 'planets',
	dwarf_planet: 'dwarf-planets',
	moon: 'moons',
	asteroid: 'asteroids',
	comet: 'comets',
	kbo: 'dwarf-planets'
};

/** Special-case NASA slugs for bodies whose URL doesn't match their name. */
const NASA_SLUG_OVERRIDES: Record<string, string> = {
	sun: 'overview',
	moon: 'earths-moon'
};

function nasaSolarSystemUrl(body: SolarSystemBody): string | null {
	if (body.id === 'sun') {
		return 'https://solarsystem.nasa.gov/sun/overview/';
	}
	const category = NASA_CATEGORIES[body.type];
	if (!category) return null;
	const slug = NASA_SLUG_OVERRIDES[body.id] ?? body.name.toLowerCase().replace(/ /g, '-');
	return `https://solarsystem.nasa.gov/${category}/${slug}/overview/`;
}

export function starLinks(star: NotableStar): ExternalLink[] {
	const links: ExternalLink[] = [
		{ label: 'Wikipedia', url: wikipediaUrl(star.name) }
	];
	if (star.hip) {
		links.push({ label: 'SIMBAD', url: simbadUrl(`HIP ${star.hip}`) });
	}
	return links;
}

export function bodyLinks(body: SolarSystemBody): ExternalLink[] {
	const links: ExternalLink[] = [
		{ label: 'Wikipedia', url: wikipediaUrl(body.name) }
	];
	const nasaUrl = nasaSolarSystemUrl(body);
	if (nasaUrl) {
		links.push({ label: 'NASA', url: nasaUrl });
	}
	return links;
}

export function satelliteLinks(satellite: Satellite): ExternalLink[] {
	return [
		{ label: 'Wikipedia', url: wikipediaUrl(satellite.name) }
	];
}

export function nebulaLinks(nebula: NebulaNO): ExternalLink[] {
	const links: ExternalLink[] = [
		{ label: 'Wikipedia', url: wikipediaUrl(nebula.name) }
	];
	const simbadId = nebula.catalog_ids[0] ?? nebula.name;
	links.push({ label: 'SIMBAD', url: simbadUrl(simbadId) });
	return links;
}

export function clusterLinks(cluster: ClusterNO): ExternalLink[] {
	const links: ExternalLink[] = [
		{ label: 'Wikipedia', url: wikipediaUrl(cluster.name) }
	];
	const simbadId = cluster.catalog_ids[0] ?? cluster.name;
	links.push({ label: 'SIMBAD', url: simbadUrl(simbadId) });
	return links;
}

export function blackholeLinks(blackhole: BlackholeNO): ExternalLink[] {
	const links: ExternalLink[] = [
		{ label: 'Wikipedia', url: wikipediaUrl(blackhole.name) }
	];
	const simbadId = blackhole.catalog_ids[0] ?? blackhole.name;
	links.push({ label: 'SIMBAD', url: simbadUrl(simbadId) });
	return links;
}
