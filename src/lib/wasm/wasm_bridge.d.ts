/* tslint:disable */
/* eslint-disable */

/**
 * Compute a Hohmann transfer between two circular orbits.
 *
 * `r_initial`: radius of departure orbit (m).
 * `r_final`: radius of arrival orbit (m).
 * `mu`: gravitational parameter (m³/s²).
 *
 * Returns transfer parameters including delta-v, transfer time, and phase angle.
 */
export function compute_hohmann(r_initial: number, r_final: number, mu: number): any;

/**
 * Compute the gravitationally-lensed light path from a source to a target.
 *
 * `source`: `[x, y, z]` in meters.
 * `target`: `[x, y, z]` in meters.
 * `bodies`: JS array of `{ position: [x, y, z], gm: number }`.
 * `points_per_segment`: interpolation resolution (default 100).
 *
 * Returns a `JsLightPathResult` with path geometry and deflection details.
 */
export function compute_light_path(source: Float64Array, target: Float64Array, bodies: any, points_per_segment: number): any;

/**
 * Compute an array of 3D positions tracing one full orbit.
 *
 * `elements` is a JS object `{ a, e, i, raan, argp, nu, mu }` (meters, radians, m³/s²).
 * Returns a flat `Float64Array` of length `num_points * 3`: `[x0, y0, z0, x1, …]`.
 */
export function compute_orbit_path(elements: any, num_points: number): Float64Array;

/**
 * Compute a Schwarzschild null geodesic in Cartesian coordinates.
 *
 * Returns a flat `Float64Array` of `[x, y, z, …]` points (meters) in the
 * orbital plane (z = 0). The massive body is at the origin.
 *
 * Useful for detailed black hole geodesic visualization.
 */
export function compute_schwarzschild_geodesic(gm: number, impact_parameter: number, phi_range: number, num_steps: number): Float64Array;

/**
 * Solve Lambert's problem: find the transfer orbit connecting two position
 * vectors in a given time of flight.
 *
 * `r1`, `r2`: flat arrays `[x, y, z]` in **meters**.
 * `tof`: time of flight in **seconds**.
 * `mu`: gravitational parameter (m³/s²).
 */
export function compute_transfer(r1: Float64Array, r2: Float64Array, tof: number, mu: number): any;

/**
 * Return all registered notable asteroid NAIF IDs (2001–2003).
 */
export function get_all_asteroid_ids(): Uint32Array;

/**
 * Return all registered comet NAIF IDs (1001–1006).
 */
export function get_all_comet_ids(): Uint32Array;

/**
 * Return all registered notable KBO NAIF IDs (3001–3003).
 */
export function get_all_kbo_ids(): Uint32Array;

/**
 * Return all registered moon NAIF IDs.
 */
export function get_all_moon_ids(): Uint32Array;

/**
 * Compute the characteristic radii and geometry of a Schwarzschild black hole.
 *
 * `gm`: gravitational parameter GM (m³/s²).
 */
export function get_black_hole_geometry(gm: number): any;

/**
 * Get physical constants for a solar-system body.
 */
export function get_body_constants(body_id: number): any;

/**
 * Compute a full orbital path for any registered body using Keplerian propagation.
 *
 * Works for Pluto (9) and dwarf planets (10–13). For planets 1–8, prefer
 * `get_planet_orbit_path` which uses VSOP87 for higher accuracy.
 *
 * Returns a flat `Float64Array` of length `num_points * 3`: `[x0, y0, z0, x1, …]`
 * in **meters** (heliocentric ecliptic J2000).
 */
export function get_body_orbit_path(body_id: number, num_points: number): Float64Array;

/**
 * Compute heliocentric J2000 position of a solar-system body at the given
 * Julian Date.
 *
 * - Planets (1–8): VSOP87A (arcsecond-level accuracy)
 * - Moon (301): Meeus Ch.47 lunar theory (~10" accuracy) + VSOP87 Earth
 * - Pluto (9), dwarf planets (10–13): Keplerian propagation from JPL elements
 * - Comets (1001–1006): Keplerian propagation from JPL SBDB elements
 *
 * Returns `[x, y, z]` in **meters** (heliocentric ecliptic J2000).
 *
 * `body_id`: 0 = Sun, 1 = Mercury … 8 = Neptune, 9 = Pluto,
 *            10 = Ceres, 11 = Eris, 12 = Haumea, 13 = Makemake, 301 = Moon,
 *            1001–1006 = Notable comets,
 *            2001–2003 = Notable asteroids (Vesta, Pallas, Hygiea),
 *            3001–3003 = Notable KBOs (Quaoar, Sedna, Orcus)
 */
export function get_body_position(body_id: number, julian_date: number): Float64Array;

/**
 * Compute the Moon's **geocentric** ecliptic J2000 position at the given JD.
 *
 * Returns `[x, y, z]` in **meters** relative to the Earth's center.
 * This is useful for rendering the Moon's position relative to Earth.
 * For the Moon's heliocentric position, use `get_body_position(301, jd)`.
 */
export function get_moon_position(julian_date: number): Float64Array;

/**
 * Get Keplerian orbital elements of a solar-system body at the given JD.
 */
export function get_orbital_elements(body_id: number, julian_date: number): any;

/**
 * Compute a series of VSOP87 positions for a planet over a time range.
 *
 * Returns a flat `Float64Array` of length `steps * 3`: `[x0, y0, z0, x1, …]`
 * in **meters** (heliocentric ecliptic J2000).
 *
 * `body_id`: 1 = Mercury … 8 = Neptune (VSOP87 planets only).
 */
export function get_planet_orbit_path(body_id: number, jd_start: number, jd_end: number, steps: number): Float64Array;

/**
 * Compute heliocentric J2000 positions for multiple bodies in a single call.
 *
 * `body_ids`: array of body IDs (same as `get_body_position`).
 * `julian_date`: Julian Date in TT.
 *
 * Returns a flat `Float64Array` of length `body_ids.len() * 3`:
 * `[x0, y0, z0, x1, y1, z1, …]` in **meters** (heliocentric ecliptic J2000).
 *
 * If any body ID is unknown, the corresponding position is `[NaN, NaN, NaN]`.
 */
export function get_positions_batch(body_ids: Uint32Array, julian_date: number): Float64Array;

/**
 * Compute a moon's position **relative to its parent body** at the given JD.
 *
 * - Moon (301): Meeus Ch.47 geocentric (~10" accuracy)
 * - Other moons: Keplerian propagation from J2000 elements
 *
 * Returns `[x, y, z]` in **meters** relative to the parent body's center.
 * Useful for rendering moons positioned around their parent planets.
 */
export function get_satellite_position(moon_id: number, julian_date: number): Float64Array;

/**
 * Compute parent-centric positions for multiple moons in a single call.
 *
 * `moon_ids`: array of moon NAIF IDs.
 * `julian_date`: Julian Date in TT.
 *
 * Returns a flat `Float64Array` of length `moon_ids.len() * 3`:
 * `[x0, y0, z0, x1, y1, z1, …]` in **meters** (parent-centric ecliptic J2000).
 *
 * If any moon ID is unknown, the corresponding position is `[NaN, NaN, NaN]`.
 */
export function get_satellite_positions_batch(moon_ids: Uint32Array, julian_date: number): Float64Array;

/**
 * Propagate a TLE to a given time offset using SGP4.
 *
 * Returns `[x, y, z]` position in **kilometers** (TEME frame).
 */
export function propagate_tle(tle_line1: string, tle_line2: string, minutes_since_epoch: number): Float64Array;

/**
 * Transform a position+velocity between reference frames.
 *
 * Supported frame names: `"ICRS"`, `"GCRS"`, `"J2000"`, `"ITRS"`, `"TEME"`.
 * `jd` is the Julian Date (required for Earth-rotation–dependent frames).
 *
 * Returns `[x, y, z, vx, vy, vz]` in the target frame (meters, m/s).
 */
export function transform_coordinates(x: number, y: number, z: number, vx: number, vy: number, vz: number, from_frame: string, to_frame: string, jd: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compute_hohmann: (a: number, b: number, c: number, d: number) => void;
    readonly compute_light_path: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly compute_orbit_path: (a: number, b: number, c: number) => void;
    readonly compute_schwarzschild_geodesic: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly compute_transfer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly get_all_asteroid_ids: (a: number) => void;
    readonly get_all_comet_ids: (a: number) => void;
    readonly get_all_kbo_ids: (a: number) => void;
    readonly get_all_moon_ids: (a: number) => void;
    readonly get_black_hole_geometry: (a: number, b: number) => void;
    readonly get_body_constants: (a: number, b: number) => void;
    readonly get_body_orbit_path: (a: number, b: number, c: number) => void;
    readonly get_body_position: (a: number, b: number, c: number) => void;
    readonly get_moon_position: (a: number, b: number) => void;
    readonly get_orbital_elements: (a: number, b: number, c: number) => void;
    readonly get_planet_orbit_path: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly get_positions_batch: (a: number, b: number, c: number, d: number) => void;
    readonly get_satellite_position: (a: number, b: number, c: number) => void;
    readonly get_satellite_positions_batch: (a: number, b: number, c: number, d: number) => void;
    readonly propagate_tle: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly transform_coordinates: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
