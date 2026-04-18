/**
 * Star catalog data types for Siderea.
 *
 * Coordinate system: J2000 equatorial, positions in parsecs.
 * 1 parsec = 3.08568e16 meters = 3.26156 light-years.
 */

/** GPU-ready star data arrays parsed from the binary catalog. */
export interface StarCatalogData {
	/** Total number of stars in the catalog. */
	count: number;

	/** Star positions: Float32Array of [x0, y0, z0, x1, y1, z1, ...] in parsecs. */
	positions: Float32Array;

	/** Apparent visual magnitudes. Lower = brighter. */
	apparentMag: Float32Array;

	/** Absolute visual magnitudes. */
	absoluteMag: Float32Array;

	/**
	 * Quantized B-V color index: uint8 where value = (bv + 0.5) / 3.0 * 255.
	 * To recover B-V: bv = (value / 255) * 3.0 - 0.5
	 */
	colorIndex: Uint8Array;

	/** Proper motion in RA (milliarcseconds/year). */
	pmRA: Float32Array;

	/** Proper motion in Dec (milliarcseconds/year). */
	pmDec: Float32Array;
}

/** Star category tags for filtering and display. */
export type StarCategory = 'brightest' | 'nearest' | 'scientific' | 'exoplanet_host';

/** Metadata for a notable (named) star. */
export interface NotableStar {
	/** Index into the catalog arrays. */
	index: number;
	/** Common name (e.g. "Sirius"). */
	name: string;
	/** Spectral type (e.g. "A1V"). */
	spectral: string;
	/** Constellation abbreviation (e.g. "CMa"). */
	constellation: string;
	/** Right ascension in decimal hours. */
	ra: number;
	/** Declination in decimal degrees. */
	dec: number;
	/** Distance in parsecs. */
	dist: number;
	/** Apparent visual magnitude. */
	mag: number;
	/** Absolute visual magnitude. */
	absmag: number;
	/** B-V color index. */
	bv: number;
	/** Short description (1-2 sentences). May be absent for less notable stars. */
	description?: string;
	/** Hipparcos catalog ID. */
	hip?: number;
	/** Henry Draper catalog ID. */
	hd?: number;
	/** Bayer/Flamsteed designation. */
	bayer?: string;
	/** Category tags (brightest, nearest, scientific, exoplanet_host). */
	categories?: StarCategory[];
	/** Mass in solar masses (curated for key stars). */
	mass_solar?: number;
	/** Radius in solar radii (curated for key stars). */
	radius_solar?: number;
	/** Notable features or facts. */
	notable_features?: string[];
}

/** Star catalog metadata JSON structure. */
export interface StarCatalogMeta {
	format_version: number;
	total_stars: number;
	bv_quantization: { min: number; max: number };
	coordinate_system: string;
	source: string;
	license: string;
	stars: NotableStar[];
}

/** RGB color as [r, g, b] in [0, 1] range. */
export type RGB = [number, number, number];

// --- Notable Object Registry types ---

/** Discriminated object type for the notable objects registry. */
export type NotableObjectType =
	| 'nebula'
	| 'cluster'
	| 'blackhole'
	| 'pulsar'
	| 'magnetar'
	| 'variable_star';

/** Nebula subtypes. */
export type NebulaSubtype = 'emission' | 'reflection' | 'planetary' | 'dark' | 'supernova_remnant';

/** Star cluster subtypes. */
export type ClusterSubtype = 'globular' | 'open';

/** Black hole subtypes. */
export type BlackholeSubtype = 'stellar' | 'supermassive';

/** Pulsar subtypes. */
export type PulsarSubtype = 'radio' | 'millisecond' | 'x-ray';

/** Magnetar subtypes. */
export type MagnetarSubtype = 'sgr' | 'axp';

/** Variable star subtypes. */
export type VariableStarSubtype = 'eclipsing' | 'pulsating' | 'eruptive' | 'cataclysmic' | 'rotating';

/** Base fields shared by all notable objects. */
interface NotableObjectBase {
	/** Unique identifier (e.g. "ngc_1976", "sgr_a_star"). */
	id: string;
	/** Common name (e.g. "Orion Nebula"). */
	name: string;
	/** Catalog designations (e.g. ["M42", "NGC 1976"]). */
	catalog_ids: string[];
	/** Right ascension in degrees (J2000). */
	ra: number;
	/** Declination in degrees (J2000). */
	dec: number;
	/** Distance in parsecs. */
	dist_pc: number;
	/** Cartesian x in parsecs (J2000 equatorial). */
	x: number;
	/** Cartesian y in parsecs (J2000 equatorial). */
	y: number;
	/** Cartesian z in parsecs (J2000 equatorial). */
	z: number;
	/** Short description (1-2 sentences). */
	description: string;
	/** Placeholder for future texture/sprite reference. */
	texture_ref: string | null;
}

/** Nebula entry. */
export interface NebulaNO extends NotableObjectBase {
	type: 'nebula';
	subtype: NebulaSubtype;
	/** Angular size in arcminutes. */
	angular_size_arcmin: number;
}

/** Star cluster entry. */
export interface ClusterNO extends NotableObjectBase {
	type: 'cluster';
	subtype: ClusterSubtype;
	/** Angular size in arcminutes. */
	angular_size_arcmin: number;
	/** Estimated number of stars. */
	star_count: number | null;
	/** Age in millions of years. */
	age_myr: number | null;
	/** Metallicity [Fe/H] (primarily for globular clusters). */
	metallicity_fe_h: number | null;
}

/** Black hole entry. */
export interface BlackholeNO extends NotableObjectBase {
	type: 'blackhole';
	subtype: BlackholeSubtype;
	/** Mass in solar masses. */
	mass_solar: number;
}

/** Pulsar entry. */
export interface PulsarNO extends NotableObjectBase {
	type: 'pulsar';
	subtype: PulsarSubtype;
	/** Rotation period in milliseconds. */
	period_ms: number;
}

/** Magnetar entry. */
export interface MagnetarNO extends NotableObjectBase {
	type: 'magnetar';
	subtype: MagnetarSubtype;
	/** Rotation period in seconds. */
	period_s: number;
	/** Magnetic field strength in Tesla. */
	magnetic_field_T: number;
}

/** Variable star entry. */
export interface VariableStarNO extends NotableObjectBase {
	type: 'variable_star';
	subtype: VariableStarSubtype;
	/** Variability period in days (null if irregular). */
	period_days: number | null;
	/** Magnitude range [brightest, faintest]. */
	mag_range: [number, number];
}

/** Union of all notable object types. */
export type NotableObject =
	| NebulaNO
	| ClusterNO
	| BlackholeNO
	| PulsarNO
	| MagnetarNO
	| VariableStarNO;

/** Notable object registry JSON structure. */
export interface NotableObjectRegistry {
	format_version: number;
	coordinate_system: string;
	total_objects: number;
	objects: NotableObject[];
}

// --- Solar System Object Registry types ---

/** Solar system body type. */
export type SolarSystemBodyType = 'star' | 'planet' | 'dwarf_planet' | 'moon' | 'comet' | 'asteroid' | 'kbo';

/** Atmosphere data for a body (null for airless bodies). */
export interface Atmosphere {
	/** Surface pressure in Earth atmospheres (null if no solid surface, e.g. gas giants). */
	surface_pressure_atm: number | null;
	/** Major atmospheric constituents: gas name → percentage. */
	composition: Record<string, number>;
}

/** Ring system data. */
export interface RingSystem {
	/** Inner edge radius in km. */
	inner_radius_km: number;
	/** Outer edge radius in km. */
	outer_radius_km: number;
	/** Short description. */
	description: string;
}

/** Metadata for a solar system body (Sun, planet, dwarf planet, or moon). */
export interface SolarSystemBody {
	/** Unique identifier (e.g. "earth", "titan"). */
	id: string;
	/** Display name. */
	name: string;
	/** NAIF body ID matching the Rust body registry (0=Sun, 1-8=planets, etc.). -1 if not in WASM registry. */
	naif_id: number;
	/** Body classification. */
	type: SolarSystemBodyType;
	/** Parent body ID (null for Sun). */
	parent_id: string | null;

	// Physical properties
	/** Mass in kg. */
	mass_kg: number;
	/** Equatorial radius in km. */
	radius_km: number;
	/** Mean radius in km. */
	radius_mean_km: number;
	/** Obliquity / axial tilt in degrees (>90° indicates retrograde rotation). */
	axial_tilt_deg: number;
	/** Sidereal rotation period in hours (negative = retrograde). */
	rotation_period_hours: number;
	/** Surface gravity in m/s². */
	surface_gravity_m_s2: number;
	/** Orbital period around parent in Earth days. */
	orbital_period_days: number;

	/** Atmosphere data (null for airless bodies). */
	atmosphere: Atmosphere | null;
	/** Ring system (null for most bodies). */
	rings: RingSystem | null;

	/** Notable surface/atmospheric features. */
	notable_features: string[];
	/** Short description (1-3 sentences). */
	description: string;
	/** Placeholder for texture asset reference. */
	texture_ref: string | null;
}

/** Satellite orbit determination method. */
export type SatelliteOrbitType =
	| 'tle'              // Position from Two-Line Element sets (LEO/MEO/GEO)
	| 'heliocentric'     // Deep-space probes with heliocentric state vectors
	| 'lagrange'         // Objects at Lagrange points (e.g. JWST at Sun-Earth L2)
	| 'surface_marker'   // Fixed location on a body's surface (e.g. Apollo landing sites)
	| 'historical_orbit' // No longer in orbit; orbital elements preserved for reference

/** Satellite classification. */
export type SatelliteSubtype =
	| 'space_station'
	| 'telescope'
	| 'probe'
	| 'constellation'
	| 'historical';

/** Heliocentric state vector at a reference epoch. */
export interface HeliocentricState {
	/** ISO 8601 reference epoch. */
	epoch: string;
	/** Position in AU (J2000 ecliptic). */
	x_au: number;
	y_au: number;
	z_au: number;
	/** Velocity in AU/day (J2000 ecliptic). */
	vx_au_day: number;
	vy_au_day: number;
	vz_au_day: number;
}

/** Surface marker coordinates (body-fixed). */
export interface SurfaceMarker {
	/** Parent body ID. */
	body_id: string;
	/** Latitude in degrees. */
	lat_deg: number;
	/** Longitude in degrees. */
	lon_deg: number;
}

/** Man-made satellite / spacecraft metadata. */
export interface Satellite {
	/** Unique identifier. */
	id: string;
	/** Display name. */
	name: string;
	/** Classification. */
	subtype: SatelliteSubtype;
	/** How this object's position is determined. */
	orbit_type: SatelliteOrbitType;
	/** Parent body ID (e.g. "earth" for LEO, "sun" for heliocentric). */
	parent_id: string;

	/** NORAD catalog ID for TLE lookup (null if not TLE-tracked). */
	norad_id: number | null;
	/** Heliocentric state vector (for deep-space probes). */
	heliocentric_state: HeliocentricState | null;
	/** Lagrange point designation (e.g. "SEL2" for Sun-Earth L2). */
	lagrange_point: string | null;
	/** Surface marker position (for landing sites). */
	surface_marker: SurfaceMarker | null;

	/** Launch date (ISO 8601). */
	launch_date: string;
	/** Mass in kg (null if unknown). */
	mass_kg: number | null;
	/** Short description. */
	description: string;
	/** Key-value stats for display (e.g. "Altitude": "408 km"). */
	stats: Record<string, string>;
}

/** Solar system object registry JSON structure. */
export interface SolarSystemRegistry {
	format_version: number;
	bodies: SolarSystemBody[];
	satellites: Satellite[];
}

// --- Exoplanet types ---

/** A single exoplanet from the NASA Exoplanet Archive. */
export interface Exoplanet {
	/** Planet name (e.g. "Proxima Cen b"). */
	name: string;
	/** Host star name in the archive (e.g. "Proxima Cen"). */
	hostname: string;
	/** Orbital period in days (null if unknown). */
	orbitalPeriodDays: number | null;
	/** Semi-major axis in AU (null if unknown). */
	semiMajorAxisAU: number | null;
	/** Planet mass in Earth masses (null if unknown). */
	massEarth: number | null;
	/** Planet radius in Earth radii (null if unknown). */
	radiusEarth: number | null;
	/** Discovery method (e.g. "Radial Velocity", "Transit"). */
	discoveryMethod: string | null;
	/** Year of discovery. */
	discoveryYear: number | null;
	/** Orbital eccentricity (null if unknown). */
	eccentricity: number | null;
	/** Orbital inclination in degrees (null if unknown). */
	inclination: number | null;
}

/** Exoplanet system data for a host star. */
export interface ExoplanetSystem {
	/** Host star name as returned by the archive. */
	hostname: string;
	/** Number of confirmed planets. */
	planetCount: number;
	/** Individual planet data. */
	planets: Exoplanet[];
}

/** Status of an exoplanet fetch (for UI binding). */
export type ExoplanetFetchStatus =
	| { state: 'idle' }
	| { state: 'loading' }
	| { state: 'success'; data: ExoplanetSystem; fromCache: boolean; fetchedAt: number; stale?: boolean }
	| { state: 'error'; message: string };
