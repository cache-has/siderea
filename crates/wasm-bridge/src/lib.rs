use wasm_bindgen::prelude::*;

mod bodies;
#[cfg(test)]
mod tests;

use astro_core::core::constants;
use astro_core::core::elements::{coe_to_rv, OrbitalElements};
use astro_core::ephemeris::{
    moon_position_geocentric, moon_position_heliocentric, planet_position, Planet,
};
use astro_core::geodesics::{
    LensingBody, LightPath, PhotonSphere, SchwarzschildGeodesic,
};
use astro_core::maneuvers::{HohmannTransfer, Lambert, LambertSolution, TransferKind};
use astro_core::propagators::keplerian::propagate_keplerian;
use astro_core::satellite::{parse_tle, propagate_from_elements};
use bodies::{body_by_id, moon_parent_id, all_moon_ids, all_comet_ids, all_asteroid_ids, all_kbo_ids};
use serde::Serialize;

// ---------------------------------------------------------------------------
// Error handling — convert Rust errors to JS exceptions
// ---------------------------------------------------------------------------

fn to_js_err(e: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&e.to_string())
}

// ---------------------------------------------------------------------------
// Serialization helper — Rust struct → JsValue via serde-wasm-bindgen
// ---------------------------------------------------------------------------

fn to_js<T: Serialize>(val: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(val).map_err(to_js_err)
}

// ---------------------------------------------------------------------------
// Julian Date ↔ seconds-since-J2000
// ---------------------------------------------------------------------------

/// Seconds elapsed since J2000.0 epoch for a given Julian Date.
fn jd_to_seconds_since_j2000(jd: f64) -> f64 {
    (jd - constants::J2000_TT) * constants::DAY_TO_SEC
}

// ---------------------------------------------------------------------------
// 1. get_body_position(body_id, julian_date) → Float64Array [x, y, z] (m)
// ---------------------------------------------------------------------------

/// Internal: compute heliocentric position without JsValue error type.
/// Returns `None` for unknown body IDs or propagation failures.
fn compute_body_position(body_id: u32, julian_date: f64) -> Option<(f64, f64, f64)> {
    if body_id == 0 {
        return Some((0.0, 0.0, 0.0));
    }

    if let Some(planet) = Planet::from_body_id(body_id) {
        let (x, y, z) = planet_position(planet, julian_date);
        return Some((x, y, z));
    }

    if body_id == 301 {
        let (x, y, z) = moon_position_heliocentric(julian_date);
        return Some((x, y, z));
    }

    if let Some(parent_id) = moon_parent_id(body_id) {
        if body_id != 301 {
            let (px, py, pz) = compute_body_position(parent_id, julian_date)?;
            let body = body_by_id(body_id)?;
            let dt = jd_to_seconds_since_j2000(julian_date);
            let propagated = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu).ok()?;
            let (offset, _vel) = coe_to_rv(&propagated, body.parent_mu);
            return Some((px + offset.x, py + offset.y, pz + offset.z));
        }
    }

    let body = body_by_id(body_id)?;
    let dt = jd_to_seconds_since_j2000(julian_date);
    let propagated = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu).ok()?;
    let (pos, _vel) = coe_to_rv(&propagated, body.parent_mu);
    Some((pos.x, pos.y, pos.z))
}

/// Internal: compute parent-centric satellite position without JsValue.
fn compute_satellite_position(moon_id: u32, julian_date: f64) -> Option<(f64, f64, f64)> {
    if moon_id == 301 {
        let (x, y, z) = moon_position_geocentric(julian_date);
        return Some((x, y, z));
    }

    let body = body_by_id(moon_id)?;
    moon_parent_id(moon_id)?; // verify it's a moon
    let dt = jd_to_seconds_since_j2000(julian_date);
    let propagated = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu).ok()?;
    let (pos, _vel) = coe_to_rv(&propagated, body.parent_mu);
    Some((pos.x, pos.y, pos.z))
}

/// Compute heliocentric J2000 position of a solar-system body at the given
/// Julian Date.
///
/// - Planets (1–8): VSOP87A (arcsecond-level accuracy)
/// - Moon (301): Meeus Ch.47 lunar theory (~10" accuracy) + VSOP87 Earth
/// - Pluto (9), dwarf planets (10–13): Keplerian propagation from JPL elements
/// - Comets (1001–1006): Keplerian propagation from JPL SBDB elements
///
/// Returns `[x, y, z]` in **meters** (heliocentric ecliptic J2000).
///
/// `body_id`: 0 = Sun, 1 = Mercury … 8 = Neptune, 9 = Pluto,
///            10 = Ceres, 11 = Eris, 12 = Haumea, 13 = Makemake, 301 = Moon,
///            1001–1006 = Notable comets,
///            2001–2003 = Notable asteroids (Vesta, Pallas, Hygiea),
///            3001–3003 = Notable KBOs (Quaoar, Sedna, Orcus)
#[wasm_bindgen]
pub fn get_body_position(body_id: u32, julian_date: f64) -> Result<Vec<f64>, JsValue> {
    match compute_body_position(body_id, julian_date) {
        Some((x, y, z)) => Ok(vec![x, y, z]),
        None => Err(to_js_err(format!("unknown or failed body_id {body_id}"))),
    }
}

// ---------------------------------------------------------------------------
// 1b. get_positions_batch(body_ids, julian_date) → Float64Array
//     [x0,y0,z0, x1,y1,z1, …] (m) — one WASM call for all bodies
// ---------------------------------------------------------------------------

/// Compute heliocentric J2000 positions for multiple bodies in a single call.
///
/// `body_ids`: array of body IDs (same as `get_body_position`).
/// `julian_date`: Julian Date in TT.
///
/// Returns a flat `Float64Array` of length `body_ids.len() * 3`:
/// `[x0, y0, z0, x1, y1, z1, …]` in **meters** (heliocentric ecliptic J2000).
///
/// If any body ID is unknown, the corresponding position is `[NaN, NaN, NaN]`.
#[wasm_bindgen]
pub fn get_positions_batch(body_ids: Vec<u32>, julian_date: f64) -> Vec<f64> {
    let mut out = Vec::with_capacity(body_ids.len() * 3);
    for &id in &body_ids {
        match compute_body_position(id, julian_date) {
            Some((x, y, z)) => {
                out.push(x);
                out.push(y);
                out.push(z);
            }
            None => {
                out.push(f64::NAN);
                out.push(f64::NAN);
                out.push(f64::NAN);
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// 1c. get_satellite_positions_batch(moon_ids, julian_date) → Float64Array
//     [x0,y0,z0, x1,y1,z1, …] (m) — parent-centric positions in one call
// ---------------------------------------------------------------------------

/// Compute parent-centric positions for multiple moons in a single call.
///
/// `moon_ids`: array of moon NAIF IDs.
/// `julian_date`: Julian Date in TT.
///
/// Returns a flat `Float64Array` of length `moon_ids.len() * 3`:
/// `[x0, y0, z0, x1, y1, z1, …]` in **meters** (parent-centric ecliptic J2000).
///
/// If any moon ID is unknown, the corresponding position is `[NaN, NaN, NaN]`.
#[wasm_bindgen]
pub fn get_satellite_positions_batch(moon_ids: Vec<u32>, julian_date: f64) -> Vec<f64> {
    let mut out = Vec::with_capacity(moon_ids.len() * 3);
    for &id in &moon_ids {
        match compute_satellite_position(id, julian_date) {
            Some((x, y, z)) => {
                out.push(x);
                out.push(y);
                out.push(z);
            }
            None => {
                out.push(f64::NAN);
                out.push(f64::NAN);
                out.push(f64::NAN);
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// 2. get_orbital_elements(body_id, julian_date) → OrbitalElements JS object
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct JsOrbitalElements {
    /// Semi-major axis (m)
    pub a: f64,
    /// Eccentricity
    pub e: f64,
    /// Inclination (rad)
    pub i: f64,
    /// Right ascension of ascending node (rad)
    pub raan: f64,
    /// Argument of periapsis (rad)
    pub argp: f64,
    /// True anomaly (rad)
    pub nu: f64,
}

impl From<&OrbitalElements> for JsOrbitalElements {
    fn from(oe: &OrbitalElements) -> Self {
        Self {
            a: oe.a,
            e: oe.e,
            i: oe.i,
            raan: oe.raan,
            argp: oe.argp,
            nu: oe.nu,
        }
    }
}

/// Get Keplerian orbital elements of a solar-system body at the given JD.
#[wasm_bindgen]
pub fn get_orbital_elements(body_id: u32, julian_date: f64) -> Result<JsValue, JsValue> {
    let body = body_by_id(body_id).ok_or_else(|| to_js_err(format!("unknown body_id {body_id}")))?;

    if body_id == 0 {
        return Err(to_js_err("Sun has no orbital elements in heliocentric frame"));
    }

    let dt = jd_to_seconds_since_j2000(julian_date);
    let propagated = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu).map_err(to_js_err)?;
    let js_oe: JsOrbitalElements = (&propagated).into();
    to_js(&js_oe)
}

// ---------------------------------------------------------------------------
// 3. compute_orbit_path(elements, num_points) → Float64Array [x0,y0,z0, …]
// ---------------------------------------------------------------------------

/// Compute an array of 3D positions tracing one full orbit.
///
/// `elements` is a JS object `{ a, e, i, raan, argp, nu, mu }` (meters, radians, m³/s²).
/// Returns a flat `Float64Array` of length `num_points * 3`: `[x0, y0, z0, x1, …]`.
#[wasm_bindgen]
pub fn compute_orbit_path(elements: JsValue, num_points: u32) -> Result<Vec<f64>, JsValue> {
    #[derive(serde::Deserialize)]
    struct OrbitInput {
        a: f64,
        e: f64,
        i: f64,
        raan: f64,
        argp: f64,
        mu: f64,
    }

    let input: OrbitInput = serde_wasm_bindgen::from_value(elements).map_err(to_js_err)?;
    let n = num_points.max(2) as usize;

    let oe = OrbitalElements::new(input.a, input.e, input.i, input.raan, input.argp, 0.0);
    let period = oe.period(input.mu).map_err(to_js_err)?;

    let mut out = Vec::with_capacity(n * 3);
    for k in 0..n {
        let dt = period * (k as f64) / (n as f64);
        let prop = propagate_keplerian(&oe, dt, input.mu).map_err(to_js_err)?;
        let (pos, _) = coe_to_rv(&prop, input.mu);
        out.push(pos.x);
        out.push(pos.y);
        out.push(pos.z);
    }

    Ok(out)
}

// ---------------------------------------------------------------------------
// 4. propagate_tle(tle_line1, tle_line2, minutes_since_epoch) → [x,y,z] (km)
// ---------------------------------------------------------------------------

/// Propagate a TLE to a given time offset using SGP4.
///
/// Returns `[x, y, z]` position in **kilometers** (TEME frame).
#[wasm_bindgen]
pub fn propagate_tle(
    tle_line1: &str,
    tle_line2: &str,
    minutes_since_epoch: f64,
) -> Result<Vec<f64>, JsValue> {
    let tle_str = format!("{tle_line1}\n{tle_line2}");
    let elements = parse_tle(&tle_str).map_err(to_js_err)?;
    let state = propagate_from_elements(&elements, minutes_since_epoch).map_err(to_js_err)?;
    Ok(state.position.to_vec())
}

// ---------------------------------------------------------------------------
// 5. compute_transfer(r1, r2, tof, mu) → TransferOrbit JS object
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct JsTransferOrbit {
    /// Departure velocity [vx, vy, vz] (m/s)
    pub v1: [f64; 3],
    /// Arrival velocity [vx, vy, vz] (m/s)
    pub v2: [f64; 3],
    /// Transfer orbit semi-major axis (m)
    pub a: f64,
    /// Transfer orbit eccentricity
    pub e: f64,
    /// Time of flight (s)
    pub tof: f64,
}

impl From<&LambertSolution> for JsTransferOrbit {
    fn from(sol: &LambertSolution) -> Self {
        Self {
            v1: [sol.v1.x, sol.v1.y, sol.v1.z],
            v2: [sol.v2.x, sol.v2.y, sol.v2.z],
            a: sol.a,
            e: sol.e,
            tof: sol.tof,
        }
    }
}

/// Solve Lambert's problem: find the transfer orbit connecting two position
/// vectors in a given time of flight.
///
/// `r1`, `r2`: flat arrays `[x, y, z]` in **meters**.
/// `tof`: time of flight in **seconds**.
/// `mu`: gravitational parameter (m³/s²).
#[wasm_bindgen]
pub fn compute_transfer(
    r1: Vec<f64>,
    r2: Vec<f64>,
    tof: f64,
    mu: f64,
) -> Result<JsValue, JsValue> {
    if r1.len() != 3 || r2.len() != 3 {
        return Err(to_js_err("r1 and r2 must each have 3 elements"));
    }

    let r1_vec = nalgebra::Vector3::new(r1[0], r1[1], r1[2]);
    let r2_vec = nalgebra::Vector3::new(r2[0], r2[1], r2[2]);

    let solution = Lambert::solve(r1_vec, r2_vec, tof, mu, TransferKind::Auto, 0)
        .map_err(to_js_err)?;

    let js_transfer: JsTransferOrbit = (&solution).into();
    to_js(&js_transfer)
}

// ---------------------------------------------------------------------------
// 5b. compute_hohmann(r_initial, r_final, mu) → HohmannResult JS object
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct JsHohmannResult {
    /// First burn delta-v (m/s)
    pub delta_v1: f64,
    /// Second burn delta-v (m/s)
    pub delta_v2: f64,
    /// Total delta-v (m/s)
    pub delta_v_total: f64,
    /// Transfer time (seconds)
    pub transfer_time: f64,
    /// Transfer orbit semi-major axis (m)
    pub transfer_sma: f64,
    /// Transfer orbit eccentricity
    pub transfer_eccentricity: f64,
    /// Optimal phase angle (radians)
    pub phase_angle: f64,
    /// Synodic period (seconds) — time between transfer windows
    pub synodic_period: f64,
}

/// Compute a Hohmann transfer between two circular orbits.
///
/// `r_initial`: radius of departure orbit (m).
/// `r_final`: radius of arrival orbit (m).
/// `mu`: gravitational parameter (m³/s²).
///
/// Returns transfer parameters including delta-v, transfer time, and phase angle.
#[wasm_bindgen]
pub fn compute_hohmann(
    r_initial: f64,
    r_final: f64,
    mu: f64,
) -> Result<JsValue, JsValue> {
    let result = HohmannTransfer::calculate(r_initial, r_final, mu).map_err(to_js_err)?;
    let phase = HohmannTransfer::phase_angle(r_initial, r_final, mu).map_err(to_js_err)?;
    let synodic = HohmannTransfer::synodic_period(r_initial, r_final, mu).map_err(to_js_err)?;

    let js_result = JsHohmannResult {
        delta_v1: result.delta_v1,
        delta_v2: result.delta_v2,
        delta_v_total: result.delta_v_total,
        transfer_time: result.transfer_time,
        transfer_sma: result.transfer_sma,
        transfer_eccentricity: result.transfer_eccentricity,
        phase_angle: phase,
        synodic_period: synodic,
    };

    to_js(&js_result)
}

// ---------------------------------------------------------------------------
// 6. get_body_constants(body_id) → BodyInfo JS object
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct JsBodyInfo {
    pub name: &'static str,
    /// Standard gravitational parameter GM (m³/s²)
    pub gm: f64,
    /// Equatorial radius (m)
    pub radius: f64,
    /// Mean radius (m)
    pub radius_mean: f64,
    /// Semi-major axis of orbit (m), 0 for Sun
    pub sma: f64,
}

/// Get physical constants for a solar-system body.
#[wasm_bindgen]
pub fn get_body_constants(body_id: u32) -> Result<JsValue, JsValue> {
    let body = body_by_id(body_id).ok_or_else(|| to_js_err(format!("unknown body_id {body_id}")))?;

    let info = JsBodyInfo {
        name: body.name,
        gm: body.gm,
        radius: body.radius,
        radius_mean: body.radius_mean,
        sma: body.elements_j2000.a,
    };

    to_js(&info)
}

// ---------------------------------------------------------------------------
// 7. transform_coordinates(x, y, z, vx, vy, vz, from_frame, to_frame, jd)
//    → Float64Array [x, y, z, vx, vy, vz]
// ---------------------------------------------------------------------------

/// Transform a position+velocity between reference frames.
///
/// Supported frame names: `"ICRS"`, `"GCRS"`, `"J2000"`, `"ITRS"`, `"TEME"`.
/// `jd` is the Julian Date (required for Earth-rotation–dependent frames).
///
/// Returns `[x, y, z, vx, vy, vz]` in the target frame (meters, m/s).
#[wasm_bindgen]
pub fn transform_coordinates(
    x: f64, y: f64, z: f64,
    vx: f64, vy: f64, vz: f64,
    from_frame: &str,
    to_frame: &str,
    jd: f64,
) -> Result<Vec<f64>, JsValue> {
    use astro_core::coordinates::frames::{GCRS, ICRS, ITRS, J2000, TEME};
    use astro_core::core::time::Epoch;

    let pos = nalgebra::Vector3::new(x, y, z);
    let vel = nalgebra::Vector3::new(vx, vy, vz);

    // Convert JD to hifitime Epoch (JD is in TT scale)
    let epoch = Epoch::from_jd(jd, hifitime::TimeScale::TT);

    // Build source frame and convert to GCRS (hub), then to target.
    let gcrs: GCRS = match from_frame {
        "ICRS" => {
            let f = ICRS::new(pos, vel);
            f.to_gcrs(&epoch).map_err(to_js_err)?
        }
        "GCRS" => GCRS::new(pos, vel, epoch),
        "J2000" => {
            let f = J2000::new(pos, vel);
            f.to_gcrs()
        }
        "ITRS" => {
            let f = ITRS::new(pos, vel, epoch);
            f.to_gcrs().map_err(to_js_err)?
        }
        "TEME" => {
            let f = TEME::new(pos, vel, epoch);
            f.to_gcrs().map_err(to_js_err)?
        }
        _ => return Err(to_js_err(format!("unknown frame: {from_frame}"))),
    };

    // Convert GCRS → target frame
    match to_frame {
        "ICRS" => {
            let out = gcrs.to_icrs().map_err(to_js_err)?;
            Ok(vec![out.position.x, out.position.y, out.position.z,
                    out.velocity.x, out.velocity.y, out.velocity.z])
        }
        "GCRS" => {
            Ok(vec![gcrs.position.x, gcrs.position.y, gcrs.position.z,
                    gcrs.velocity.x, gcrs.velocity.y, gcrs.velocity.z])
        }
        "J2000" => {
            let out = J2000::from_gcrs(&gcrs);
            Ok(vec![out.position.x, out.position.y, out.position.z,
                    out.velocity.x, out.velocity.y, out.velocity.z])
        }
        "ITRS" => {
            let out = gcrs.to_itrs().map_err(to_js_err)?;
            Ok(vec![out.position.x, out.position.y, out.position.z,
                    out.velocity.x, out.velocity.y, out.velocity.z])
        }
        "TEME" => {
            let itrs = gcrs.to_itrs().map_err(to_js_err)?;
            let out = itrs.to_teme().map_err(to_js_err)?;
            Ok(vec![out.position.x, out.position.y, out.position.z,
                    out.velocity.x, out.velocity.y, out.velocity.z])
        }
        _ => Err(to_js_err(format!("unknown frame: {to_frame}"))),
    }
}

// ---------------------------------------------------------------------------
// 8. get_moon_position(julian_date) → Float64Array [x, y, z] (m, geocentric)
// ---------------------------------------------------------------------------

/// Compute the Moon's **geocentric** ecliptic J2000 position at the given JD.
///
/// Returns `[x, y, z]` in **meters** relative to the Earth's center.
/// This is useful for rendering the Moon's position relative to Earth.
/// For the Moon's heliocentric position, use `get_body_position(301, jd)`.
#[wasm_bindgen]
pub fn get_moon_position(julian_date: f64) -> Vec<f64> {
    let (x, y, z) = moon_position_geocentric(julian_date);
    vec![x, y, z]
}

// ---------------------------------------------------------------------------
// 8b. get_satellite_position(moon_id, julian_date) → Float64Array (m, parent-centric)
// ---------------------------------------------------------------------------

/// Compute a moon's position **relative to its parent body** at the given JD.
///
/// - Moon (301): Meeus Ch.47 geocentric (~10" accuracy)
/// - Other moons: Keplerian propagation from J2000 elements
///
/// Returns `[x, y, z]` in **meters** relative to the parent body's center.
/// Useful for rendering moons positioned around their parent planets.
#[wasm_bindgen]
pub fn get_satellite_position(moon_id: u32, julian_date: f64) -> Result<Vec<f64>, JsValue> {
    match compute_satellite_position(moon_id, julian_date) {
        Some((x, y, z)) => Ok(vec![x, y, z]),
        None => Err(to_js_err(format!("unknown or failed moon_id {moon_id}"))),
    }
}

// ---------------------------------------------------------------------------
// 8c. get_all_moon_ids() → Uint32Array
// ---------------------------------------------------------------------------

/// Return all registered moon NAIF IDs.
#[wasm_bindgen]
pub fn get_all_moon_ids() -> Vec<u32> {
    all_moon_ids()
}

// ---------------------------------------------------------------------------
// 8d. get_all_comet_ids() → Uint32Array
// ---------------------------------------------------------------------------

/// Return all registered comet NAIF IDs (1001–1006).
#[wasm_bindgen]
pub fn get_all_comet_ids() -> Vec<u32> {
    all_comet_ids()
}

// ---------------------------------------------------------------------------
// 8e. get_all_asteroid_ids() → Uint32Array
// ---------------------------------------------------------------------------

/// Return all registered notable asteroid NAIF IDs (2001–2003).
#[wasm_bindgen]
pub fn get_all_asteroid_ids() -> Vec<u32> {
    all_asteroid_ids()
}

// ---------------------------------------------------------------------------
// 8f. get_all_kbo_ids() → Uint32Array
// ---------------------------------------------------------------------------

/// Return all registered notable KBO NAIF IDs (3001–3003).
#[wasm_bindgen]
pub fn get_all_kbo_ids() -> Vec<u32> {
    all_kbo_ids()
}

// ---------------------------------------------------------------------------
// 9. get_body_orbit_path(body_id, num_points) → Float64Array
// ---------------------------------------------------------------------------

/// Compute a full orbital path for any registered body using Keplerian propagation.
///
/// Works for Pluto (9) and dwarf planets (10–13). For planets 1–8, prefer
/// `get_planet_orbit_path` which uses VSOP87 for higher accuracy.
///
/// Returns a flat `Float64Array` of length `num_points * 3`: `[x0, y0, z0, x1, …]`
/// in **meters** (heliocentric ecliptic J2000).
#[wasm_bindgen]
pub fn get_body_orbit_path(body_id: u32, num_points: u32) -> Result<Vec<f64>, JsValue> {
    let body = body_by_id(body_id).ok_or_else(|| to_js_err(format!("unknown body_id {body_id}")))?;

    if body_id == 0 {
        return Err(to_js_err("Sun has no orbit in heliocentric frame"));
    }

    let n = num_points.max(2) as usize;
    let period = body.elements_j2000.period(body.parent_mu).map_err(to_js_err)?;

    let mut out = Vec::with_capacity(n * 3);
    for k in 0..n {
        let dt = period * (k as f64) / (n as f64);
        let prop = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu).map_err(to_js_err)?;
        let (pos, _) = coe_to_rv(&prop, body.parent_mu);
        out.push(pos.x);
        out.push(pos.y);
        out.push(pos.z);
    }

    Ok(out)
}

// ---------------------------------------------------------------------------
// 10. get_planet_orbit_path(body_id, jd_start, jd_end, steps) → Float64Array
// ---------------------------------------------------------------------------

/// Compute a series of VSOP87 positions for a planet over a time range.
///
/// Returns a flat `Float64Array` of length `steps * 3`: `[x0, y0, z0, x1, …]`
/// in **meters** (heliocentric ecliptic J2000).
///
/// `body_id`: 1 = Mercury … 8 = Neptune (VSOP87 planets only).
#[wasm_bindgen]
pub fn get_planet_orbit_path(
    body_id: u32,
    jd_start: f64,
    jd_end: f64,
    steps: u32,
) -> Result<Vec<f64>, JsValue> {
    let planet = Planet::from_body_id(body_id)
        .ok_or_else(|| to_js_err(format!("body_id {body_id} is not a VSOP87 planet (1–8)")))?;

    let n = steps.max(2) as usize;
    let mut out = Vec::with_capacity(n * 3);
    let span = jd_end - jd_start;

    for i in 0..n {
        let jde = jd_start + span * (i as f64) / ((n - 1) as f64);
        let (x, y, z) = planet_position(planet, jde);
        out.push(x);
        out.push(y);
        out.push(z);
    }

    Ok(out)
}

// ---------------------------------------------------------------------------
// 11. compute_light_path(source, target, bodies) → LightPathResult JS object
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct JsDeflectionEvent {
    /// Index of the body in the input slice.
    pub body_index: u32,
    /// Deflection angle (radians).
    pub deflection_angle: f64,
    /// Closest approach distance (meters).
    pub closest_approach: f64,
    /// Whether full numerical integration was used.
    pub numerical: bool,
}

#[derive(Serialize)]
pub struct JsLightPathResult {
    /// Flat array of path points [x0,y0,z0, x1,y1,z1, …] in meters.
    pub points: Vec<f64>,
    /// Total path distance (meters).
    pub total_distance: f64,
    /// Light travel time (seconds).
    pub travel_time: f64,
    /// Straight-line distance (meters).
    pub straight_line_distance: f64,
    /// Total accumulated deflection (radians).
    pub total_deflection: f64,
    /// Deflection events along the path.
    pub deflections: Vec<JsDeflectionEvent>,
}

/// Compute the gravitationally-lensed light path from a source to a target.
///
/// `source`: `[x, y, z]` in meters.
/// `target`: `[x, y, z]` in meters.
/// `bodies`: JS array of `{ position: [x, y, z], gm: number }`.
/// `points_per_segment`: interpolation resolution (default 100).
///
/// Returns a `JsLightPathResult` with path geometry and deflection details.
#[wasm_bindgen]
pub fn compute_light_path(
    source: Vec<f64>,
    target: Vec<f64>,
    bodies: JsValue,
    points_per_segment: u32,
) -> Result<JsValue, JsValue> {
    if source.len() != 3 || target.len() != 3 {
        return Err(to_js_err("source and target must each have 3 elements"));
    }

    #[derive(serde::Deserialize)]
    struct BodyInput {
        position: [f64; 3],
        gm: f64,
    }

    let body_inputs: Vec<BodyInput> =
        serde_wasm_bindgen::from_value(bodies).map_err(to_js_err)?;

    let lensing_bodies: Vec<LensingBody> = body_inputs
        .iter()
        .map(|b| LensingBody {
            position: b.position,
            gm: b.gm,
        })
        .collect();

    let src = [source[0], source[1], source[2]];
    let tgt = [target[0], target[1], target[2]];

    let result = LightPath::compute(
        src,
        tgt,
        &lensing_bodies,
        points_per_segment.max(2) as usize,
    )
    .map_err(to_js_err)?;

    let flat_points: Vec<f64> = result
        .points
        .iter()
        .flat_map(|p| p.iter().copied())
        .collect();

    let deflections: Vec<JsDeflectionEvent> = result
        .deflections
        .iter()
        .map(|d| JsDeflectionEvent {
            body_index: d.body_index as u32,
            deflection_angle: d.deflection_angle,
            closest_approach: d.closest_approach,
            numerical: d.numerical,
        })
        .collect();

    let js_result = JsLightPathResult {
        points: flat_points,
        total_distance: result.total_distance,
        travel_time: result.travel_time,
        straight_line_distance: result.straight_line_distance,
        total_deflection: result.total_deflection,
        deflections,
    };

    to_js(&js_result)
}

// ---------------------------------------------------------------------------
// 12. compute_schwarzschild_geodesic(gm, impact_parameter, phi_range, num_steps)
//     → Float64Array [x0,y0,z0, x1,y1,z1, …] in meters
// ---------------------------------------------------------------------------

/// Compute a Schwarzschild null geodesic in Cartesian coordinates.
///
/// Returns a flat `Float64Array` of `[x, y, z, …]` points (meters) in the
/// orbital plane (z = 0). The massive body is at the origin.
///
/// Useful for detailed black hole geodesic visualization.
#[wasm_bindgen]
pub fn compute_schwarzschild_geodesic(
    gm: f64,
    impact_parameter: f64,
    phi_range: f64,
    num_steps: u32,
) -> Result<Vec<f64>, JsValue> {
    let points = SchwarzschildGeodesic::integrate_to_cartesian(
        gm,
        impact_parameter,
        phi_range,
        num_steps as usize,
    )
    .map_err(to_js_err)?;

    let flat: Vec<f64> = points.iter().flat_map(|p| p.iter().copied()).collect();
    Ok(flat)
}

// ---------------------------------------------------------------------------
// 13. get_black_hole_geometry(gm) → BlackHoleGeometry JS object
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct JsBlackHoleGeometry {
    pub schwarzschild_radius: f64,
    pub photon_sphere_radius: f64,
    pub isco_radius: f64,
    pub critical_impact_parameter: f64,
    pub shadow_radius: f64,
}

/// Compute the characteristic radii and geometry of a Schwarzschild black hole.
///
/// `gm`: gravitational parameter GM (m³/s²).
#[wasm_bindgen]
pub fn get_black_hole_geometry(gm: f64) -> Result<JsValue, JsValue> {
    let geom = PhotonSphere::geometry(gm).map_err(to_js_err)?;
    let js_geom = JsBlackHoleGeometry {
        schwarzschild_radius: geom.schwarzschild_radius,
        photon_sphere_radius: geom.photon_sphere_radius,
        isco_radius: geom.isco_radius,
        critical_impact_parameter: geom.critical_impact_parameter,
        shadow_radius: geom.shadow_radius,
    };
    to_js(&js_geom)
}
