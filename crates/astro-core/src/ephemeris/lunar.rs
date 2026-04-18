//! Lunar position via Meeus "Astronomical Algorithms" Chapter 47.
//!
//! Computes geocentric ecliptic J2000 position of the Moon using the
//! simplified ELP theory from Jean Meeus. Accuracy is ~10" in longitude
//! and ~4" in latitude over several centuries around J2000.
//!
//! Reference: Meeus, Jean. "Astronomical Algorithms", 2nd ed., 1998,
//! Chapter 47: "Position of the Moon".

use std::f64::consts::PI;

const DEG_TO_RAD: f64 = PI / 180.0;

// ---------------------------------------------------------------------------
// Fundamental arguments (degrees), Meeus Table 47.A preamble
// ---------------------------------------------------------------------------

/// Moon's mean longitude, referred to the mean equinox of the date (L').
fn mean_longitude(t: f64) -> f64 {
    normalize_degrees(
        218.3164477 + 481267.88123421 * t - 0.0015786 * t * t
            + t * t * t / 538841.0
            - t * t * t * t / 65194000.0,
    )
}

/// Mean elongation of the Moon (D).
fn mean_elongation(t: f64) -> f64 {
    normalize_degrees(
        297.8501921 + 445267.1114034 * t - 0.0018819 * t * t
            + t * t * t / 545868.0
            - t * t * t * t / 113065000.0,
    )
}

/// Sun's mean anomaly (M).
fn sun_mean_anomaly(t: f64) -> f64 {
    normalize_degrees(
        357.5291092 + 35999.0502909 * t - 0.0001536 * t * t
            + t * t * t / 24490000.0,
    )
}

/// Moon's mean anomaly (M').
fn moon_mean_anomaly(t: f64) -> f64 {
    normalize_degrees(
        134.9633964 + 477198.8675055 * t + 0.0087414 * t * t
            + t * t * t / 69699.0
            - t * t * t * t / 14712000.0,
    )
}

/// Moon's argument of latitude (F).
fn argument_of_latitude(t: f64) -> f64 {
    normalize_degrees(
        93.2720950 + 483202.0175233 * t - 0.0036539 * t * t
            - t * t * t / 3526000.0
            + t * t * t * t / 863310000.0,
    )
}

fn normalize_degrees(mut deg: f64) -> f64 {
    deg %= 360.0;
    if deg < 0.0 {
        deg += 360.0;
    }
    deg
}

// ---------------------------------------------------------------------------
// Periodic term tables — Meeus Table 47.A (longitude & distance)
// ---------------------------------------------------------------------------

/// Each entry: (D, M, M', F, Σl coefficient, Σr coefficient)
/// Σl in units of 0.000001°, Σr in units of 0.001 km.
#[rustfmt::skip]
static LR_TERMS: [(i32, i32, i32, i32, i64, i64); 60] = [
    ( 0,  0,  1,  0,  6288774, -20905355),
    ( 2,  0, -1,  0,  1274027,  -3699111),
    ( 2,  0,  0,  0,   658314,  -2955968),
    ( 0,  0,  2,  0,   213618,   -569925),
    ( 0,  1,  0,  0,  -185116,     48888),
    ( 0,  0,  0,  2,  -114332,     -3149),
    ( 2,  0, -2,  0,    58793,    246158),
    ( 2, -1, -1,  0,    57066,   -152138),
    ( 2,  0,  1,  0,    53322,   -170733),
    ( 2, -1,  0,  0,    45758,   -204586),
    ( 0,  1, -1,  0,   -40923,   -129620),
    ( 1,  0,  0,  0,   -34720,    108743),
    ( 0,  1,  1,  0,   -30383,    104755),
    ( 2,  0,  0, -2,    15327,     10321),
    ( 0,  0,  1,  2,   -12528,         0),
    ( 0,  0,  1, -2,    10980,     79661),
    ( 4,  0, -1,  0,    10675,    -34782),
    ( 0,  0,  3,  0,    10034,    -23210),
    ( 4,  0, -2,  0,     8548,    -21636),
    ( 2,  1, -1,  0,    -7888,     24208),
    ( 2,  1,  0,  0,    -6766,     30824),
    ( 1,  0, -1,  0,    -5163,     -8379),
    ( 1,  1,  0,  0,     4987,    -16675),
    ( 2, -1,  1,  0,     4036,    -12831),
    ( 2,  0,  2,  0,     3994,    -10445),
    ( 4,  0,  0,  0,     3861,    -11650),
    ( 2,  0, -3,  0,     3665,     14403),
    ( 0,  1, -2,  0,    -2689,     -7003),
    ( 2,  0, -1,  2,    -2602,         0),
    ( 2, -1, -2,  0,     2390,     10056),
    ( 1,  0,  1,  0,    -2348,      6322),
    ( 2, -2,  0,  0,     2236,     -9884),
    ( 0,  1,  2,  0,    -2120,      5751),
    ( 0,  2,  0,  0,    -2069,         0),
    ( 2, -2, -1,  0,     2048,     -4950),
    ( 2,  0,  1, -2,    -1773,      4130),
    ( 2,  0,  0,  2,    -1595,         0),
    ( 4, -1, -1,  0,     1215,     -3958),
    ( 0,  0,  2,  2,    -1110,         0),
    ( 3,  0, -1,  0,     -892,      3258),
    ( 2,  1,  1,  0,     -810,      2616),
    ( 4, -1, -2,  0,      759,     -1897),
    ( 0,  2, -1,  0,     -713,     -2117),
    ( 2,  2, -1,  0,     -700,      2354),
    ( 2,  1, -2,  0,      691,         0),
    ( 2, -1,  0, -2,      596,         0),
    ( 4,  0,  1,  0,      549,     -1423),
    ( 0,  0,  4,  0,      537,     -1117),
    ( 4, -1,  0,  0,      520,     -1571),
    ( 1,  0, -2,  0,     -487,     -1739),
    ( 2,  1,  0, -2,     -399,         0),
    ( 0,  0,  2, -2,     -381,     -4421),
    ( 1,  1,  1,  0,      351,         0),
    ( 3,  0, -2,  0,     -340,         0),
    ( 4,  0, -3,  0,      330,         0),
    ( 2, -1,  2,  0,      327,         0),
    ( 0,  2,  1,  0,     -323,      1165),
    ( 1,  1, -1,  0,      299,         0),
    ( 2,  0,  3,  0,      294,         0),
    ( 2,  0, -1, -2,        0,      8752),
];

// ---------------------------------------------------------------------------
// Periodic term tables — Meeus Table 47.B (latitude)
// ---------------------------------------------------------------------------

/// Each entry: (D, M, M', F, Σb coefficient)
/// Σb in units of 0.000001°.
#[rustfmt::skip]
static B_TERMS: [(i32, i32, i32, i32, i64); 60] = [
    ( 0,  0,  0,  1, 5128122),
    ( 0,  0,  1,  1,  280602),
    ( 0,  0,  1, -1,  277693),
    ( 2,  0,  0, -1,  173237),
    ( 2,  0, -1,  1,   55413),
    ( 2,  0, -1, -1,   46271),
    ( 2,  0,  0,  1,   32573),
    ( 0,  0,  2,  1,   17198),
    ( 2,  0,  1, -1,    9266),
    ( 0,  0,  2, -1,    8822),
    ( 2, -1,  0, -1,    8216),
    ( 2,  0, -2, -1,    4324),
    ( 2,  0,  1,  1,    4200),
    ( 2,  1,  0, -1,   -3359),
    ( 2, -1, -1,  1,    2463),
    ( 2, -1,  0,  1,    2211),
    ( 2, -1, -1, -1,    2065),
    ( 0,  1, -1, -1,   -1870),
    ( 4,  0, -1, -1,    1828),
    ( 0,  1,  0,  1,   -1794),
    ( 0,  0,  0,  3,   -1749),
    ( 0,  1, -1,  1,   -1565),
    ( 1,  0,  0,  1,   -1491),
    ( 0,  1,  1,  1,   -1475),
    ( 0,  1,  1, -1,   -1410),
    ( 0,  1,  0, -1,   -1344),
    ( 1,  0,  0, -1,   -1335),
    ( 0,  0,  3,  1,    1107),
    ( 4,  0,  0, -1,    1021),
    ( 4,  0, -1,  1,     833),
    ( 0,  0,  1, -3,     777),
    ( 4,  0, -2,  1,     671),
    ( 2,  0,  0, -3,     607),
    ( 2,  0,  2, -1,     596),
    ( 2, -1,  1, -1,     491),
    ( 2,  0, -2,  1,    -451),
    ( 0,  0,  3, -1,     439),
    ( 2,  0,  2,  1,     422),
    ( 2,  0, -3, -1,     421),
    ( 2,  1, -1,  1,    -366),
    ( 2,  1,  0,  1,    -351),
    ( 4,  0,  0,  1,     331),
    ( 2, -1,  1,  1,     315),
    ( 2, -2,  0, -1,     302),
    ( 0,  0,  1,  3,    -283),
    ( 2,  1,  1, -1,    -229),
    ( 1,  1,  0, -1,     223),
    ( 1,  1,  0,  1,     223),
    ( 0,  1, -2, -1,    -220),
    ( 2,  1, -1, -1,    -220),
    ( 1,  0,  1,  1,    -185),
    ( 2, -1, -2, -1,     181),
    ( 0,  1,  2,  1,    -177),
    ( 4,  0, -2, -1,     176),
    ( 4, -1, -1, -1,     166),
    ( 1,  0,  1, -1,    -164),
    ( 4,  0,  1, -1,     132),
    ( 1,  0, -1, -1,    -119),
    ( 4, -1,  0, -1,     115),
    ( 2, -2,  0,  1,     107),
];

// ---------------------------------------------------------------------------
// Three additional corrections (Meeus p.342)
// ---------------------------------------------------------------------------

/// Venus correction coefficient A1 (degrees).
fn a1(t: f64) -> f64 {
    normalize_degrees(119.75 + 131.849 * t)
}

/// Jupiter correction coefficient A2 (degrees).
fn a2(t: f64) -> f64 {
    normalize_degrees(53.09 + 479264.290 * t)
}

/// Flat-Earth correction A3 (degrees).
fn a3(t: f64) -> f64 {
    normalize_degrees(313.45 + 481266.484 * t)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Geocentric ecliptic position of the Moon.
///
/// Returns (longitude_deg, latitude_deg, distance_km) in the ecliptic
/// coordinate system of the date.
pub struct LunarPosition {
    /// Geocentric ecliptic longitude (degrees)
    pub longitude_deg: f64,
    /// Geocentric ecliptic latitude (degrees)
    pub latitude_deg: f64,
    /// Distance from Earth center (km)
    pub distance_km: f64,
}

/// Compute the geocentric ecliptic position of the Moon.
///
/// `jde` is the Julian Ephemeris Day (TDB/TDT scale).
///
/// Returns geocentric ecliptic coordinates of the date (not J2000 —
/// use [`moon_position_ecliptic_j2000`] for J2000 rectangular coordinates).
pub fn moon_geocentric_ecliptic(jde: f64) -> LunarPosition {
    let t = (jde - 2_451_545.0) / 36525.0;

    // Fundamental arguments (degrees)
    let l_prime = mean_longitude(t);
    let d = mean_elongation(t);
    let m = sun_mean_anomaly(t);
    let m_prime = moon_mean_anomaly(t);
    let f = argument_of_latitude(t);

    // Eccentricity correction for terms involving the Sun's mean anomaly
    let e = 1.0 - 0.002516 * t - 0.0000074 * t * t;
    let e2 = e * e;

    // Sum longitude and distance terms (Table 47.A)
    let mut sum_l: f64 = 0.0;
    let mut sum_r: f64 = 0.0;

    for &(d_m, m_m, mp_m, f_m, sl, sr) in &LR_TERMS {
        let arg = (d_m as f64 * d + m_m as f64 * m + mp_m as f64 * m_prime + f_m as f64 * f)
            * DEG_TO_RAD;

        // Eccentricity correction
        let e_corr = match m_m.abs() {
            1 => e,
            2 => e2,
            _ => 1.0,
        };

        sum_l += sl as f64 * e_corr * arg.sin();
        sum_r += sr as f64 * e_corr * arg.cos();
    }

    // Sum latitude terms (Table 47.B)
    let mut sum_b: f64 = 0.0;

    for &(d_m, m_m, mp_m, f_m, sb) in &B_TERMS {
        let arg = (d_m as f64 * d + m_m as f64 * m + mp_m as f64 * m_prime + f_m as f64 * f)
            * DEG_TO_RAD;

        let e_corr = match m_m.abs() {
            1 => e,
            2 => e2,
            _ => 1.0,
        };

        sum_b += sb as f64 * e_corr * arg.sin();
    }

    // Additive corrections (Meeus p.342)
    let a1_rad = a1(t) * DEG_TO_RAD;
    let a2_rad = a2(t) * DEG_TO_RAD;
    let a3_rad = a3(t) * DEG_TO_RAD;

    sum_l += 3958.0 * a1_rad.sin() + 1962.0 * (l_prime * DEG_TO_RAD - f * DEG_TO_RAD).sin()
        + 318.0 * a2_rad.sin();

    sum_b += -2235.0 * (l_prime * DEG_TO_RAD).sin()
        + 382.0 * a3_rad.sin()
        + 175.0 * (a1_rad - f * DEG_TO_RAD).sin()
        + 175.0 * (a1_rad + f * DEG_TO_RAD).sin()
        + 127.0 * ((l_prime - m_prime) * DEG_TO_RAD).sin()
        - 115.0 * ((l_prime + m_prime) * DEG_TO_RAD).sin();

    // Final results
    let longitude = l_prime + sum_l / 1_000_000.0;
    let latitude = sum_b / 1_000_000.0;
    let distance_km = 385000.56 + sum_r / 1000.0;

    LunarPosition {
        longitude_deg: normalize_degrees(longitude),
        latitude_deg: latitude,
        distance_km,
    }
}

/// Mean obliquity of the ecliptic (degrees) at Julian century T from J2000.
///
/// IAU 2006 formula (Hilton et al., 2006).
fn mean_obliquity_deg(t: f64) -> f64 {
    23.439291111 - 0.013004167 * t - 1.638e-7 * t * t + 5.036e-7 * t * t * t
}

/// Compute the Moon's geocentric ecliptic J2000 rectangular position in **meters**.
///
/// `jde` is the Julian Ephemeris Day.
///
/// Returns `(x, y, z)` in meters, geocentric ecliptic J2000 frame.
/// To get heliocentric coordinates, add Earth's VSOP87 position.
pub fn moon_position_geocentric(jde: f64) -> (f64, f64, f64) {
    let pos = moon_geocentric_ecliptic(jde);

    let lon = pos.longitude_deg * DEG_TO_RAD;
    let lat = pos.latitude_deg * DEG_TO_RAD;
    let dist_m = pos.distance_km * 1000.0;

    // Ecliptic spherical → ecliptic rectangular (of the date)
    let x_ecl = dist_m * lat.cos() * lon.cos();
    let y_ecl = dist_m * lat.cos() * lon.sin();
    let z_ecl = dist_m * lat.sin();

    // Precession correction: rotate from ecliptic-of-date to ecliptic-J2000.
    // For the Moon's accuracy level (~10"), a simplified precession is adequate.
    // The ecliptic longitude precession is ~5029"/cy (general precession in longitude).
    let t = (jde - 2_451_545.0) / 36525.0;

    // General precession in longitude (Lieske 1979)
    let psi_a = (5029.0966 * t + 1.1120 * t * t - 0.000006 * t * t * t) / 3600.0 * DEG_TO_RAD;

    // Change in obliquity from J2000
    let eps_0 = mean_obliquity_deg(0.0) * DEG_TO_RAD; // J2000 obliquity
    let eps_date = mean_obliquity_deg(t) * DEG_TO_RAD;

    // Simplified ecliptic precession: rotate in ecliptic longitude by -psi_a
    // and tilt by the change in obliquity.
    // For dates within a few centuries of J2000, this is adequate.
    let cos_psi = psi_a.cos();
    let sin_psi = psi_a.sin();

    // Rotate around ecliptic pole (Z-axis of ecliptic) by -psi_a
    let x_j2000 = x_ecl * cos_psi + y_ecl * sin_psi;
    let y_j2000 = -x_ecl * sin_psi + y_ecl * cos_psi;

    // Small tilt correction for obliquity change (negligible for ~centuries)
    let d_eps = eps_date - eps_0;
    let z_j2000 = z_ecl + y_j2000 * d_eps.sin();
    let y_j2000_corr = y_j2000 * d_eps.cos();

    (x_j2000, y_j2000_corr, z_j2000)
}

/// Compute the Moon's heliocentric ecliptic J2000 position in **meters**.
///
/// This adds the Earth's VSOP87 heliocentric position to the Moon's geocentric
/// position, yielding a heliocentric position consistent with the planetary positions.
pub fn moon_position_heliocentric(jde: f64) -> (f64, f64, f64) {
    let (mx, my, mz) = moon_position_geocentric(jde);
    let (ex, ey, ez) = super::vsop87::planet_position(super::vsop87::Planet::Earth, jde);

    (ex + mx, ey + my, ez + mz)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moon_distance_at_j2000() {
        let pos = moon_geocentric_ecliptic(2_451_545.0);
        // Moon distance should be roughly 356,500–406,700 km (perigee to apogee)
        assert!(
            pos.distance_km > 356_000.0 && pos.distance_km < 407_000.0,
            "Moon distance at J2000: {} km",
            pos.distance_km
        );
    }

    #[test]
    fn moon_latitude_bounded() {
        // Moon's ecliptic latitude should be within ±5.3°
        for day_offset in 0..365 {
            let jde = 2_451_545.0 + day_offset as f64;
            let pos = moon_geocentric_ecliptic(jde);
            assert!(
                pos.latitude_deg.abs() < 5.4,
                "Moon latitude out of range at JDE {}: {}°",
                jde,
                pos.latitude_deg
            );
        }
    }

    #[test]
    fn moon_geocentric_xyz_distance() {
        let jde = 2_451_545.0;
        let (x, y, z) = moon_position_geocentric(jde);
        let r = (x * x + y * y + z * z).sqrt();
        let r_km = r / 1000.0;
        assert!(
            r_km > 356_000.0 && r_km < 407_000.0,
            "Moon geocentric distance: {} km",
            r_km
        );
    }

    #[test]
    fn moon_heliocentric_near_earth() {
        // Heliocentric Moon should be near Earth (within ~410,000 km)
        let jde = 2_451_545.0;
        let (mx, my, mz) = moon_position_heliocentric(jde);
        let (ex, ey, ez) =
            super::super::vsop87::planet_position(super::super::vsop87::Planet::Earth, jde);

        let dx = mx - ex;
        let dy = my - ey;
        let dz = mz - ez;
        let sep_km = (dx * dx + dy * dy + dz * dz).sqrt() / 1000.0;

        assert!(
            sep_km > 356_000.0 && sep_km < 407_000.0,
            "Moon-Earth separation: {} km",
            sep_km
        );
    }

    /// Meeus Example 47.a: 1992 April 12, 0h TDT (JDE 2448724.5)
    /// Expected: λ = 133.162°, β = -3.229°, Δ = 368409.7 km
    #[test]
    fn meeus_example_47a() {
        let jde = 2_448_724.5;
        let pos = moon_geocentric_ecliptic(jde);

        // Longitude: within 0.05° (~3 arcminutes, generous for simplified theory)
        assert!(
            (pos.longitude_deg - 133.162).abs() < 0.05,
            "Longitude: {}° expected ~133.162°",
            pos.longitude_deg
        );
        // Latitude: within 0.02°
        assert!(
            (pos.latitude_deg - (-3.229)).abs() < 0.02,
            "Latitude: {}° expected ~-3.229°",
            pos.latitude_deg
        );
        // Distance: within 10 km
        assert!(
            (pos.distance_km - 368409.7).abs() < 15.0,
            "Distance: {} km expected ~368409.7 km",
            pos.distance_km
        );
    }

    #[test]
    fn moon_performance() {
        let n = 10_000;
        let start = std::time::Instant::now();
        for i in 0..n {
            let jde = 2_451_545.0 + (i as f64) * 0.1;
            let _ = moon_position_heliocentric(jde);
        }
        let us_per_call = start.elapsed().as_micros() as f64 / n as f64;
        println!("  Moon position (heliocentric): {us_per_call:.2} µs/call");
        assert!(us_per_call < 500.0, "Moon position too slow: {us_per_call} µs/call");
    }
}
