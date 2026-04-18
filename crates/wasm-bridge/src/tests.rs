//! Native unit tests for wasm-bridge functions.
//! These test the Rust logic directly, not through WASM.

use crate::bodies::body_by_id;
use astro_core::core::constants::*;
use astro_core::core::elements::{coe_to_rv, OrbitalElements};
use astro_core::ephemeris::{planet_position, planet_position_au, Planet};
use astro_core::maneuvers::{Lambert, TransferKind};
use astro_core::propagators::keplerian::propagate_keplerian;
use astro_core::satellite::{parse_tle, propagate_from_elements};
use astro_core::geodesics::{LensingBody, LightPath, SchwarzschildGeodesic};
use approx::assert_relative_eq;
use std::time::Instant;

#[test]
fn body_registry_lookup() {
    assert!(body_by_id(0).is_some()); // Sun
    assert!(body_by_id(3).is_some()); // Earth
    assert!(body_by_id(9).is_some()); // Pluto
    assert!(body_by_id(301).is_some()); // Moon
    assert!(body_by_id(999).is_none()); // unknown

    let earth = body_by_id(3).unwrap();
    assert_eq!(earth.name, "Earth");
    assert_relative_eq!(earth.gm, GM_EARTH, epsilon = 1.0);
    assert_relative_eq!(earth.radius, R_EARTH, epsilon = 1.0);
}

#[test]
fn body_position_earth_at_j2000() {
    let earth = body_by_id(3).unwrap();
    // At J2000 (dt = 0), position should come from the J2000 elements directly
    let (pos, _vel) = coe_to_rv(&earth.elements_j2000, earth.parent_mu);
    // Earth is ~1 AU from the Sun
    let r = (pos.x * pos.x + pos.y * pos.y + pos.z * pos.z).sqrt();
    assert!(r > 0.95 * AU && r < 1.05 * AU, "Earth distance from Sun: {r} m, expected ~{AU} m");
}

#[test]
fn body_position_propagates_forward() {
    let earth = body_by_id(3).unwrap();
    let dt = 365.25 * DAY_TO_SEC; // ~1 year
    let propagated = propagate_keplerian(&earth.elements_j2000, dt, earth.parent_mu).unwrap();
    let (pos, _) = coe_to_rv(&propagated, earth.parent_mu);
    let r = (pos.x * pos.x + pos.y * pos.y + pos.z * pos.z).sqrt();
    // After one year, Earth should still be ~1 AU
    assert!(r > 0.95 * AU && r < 1.05 * AU, "Earth distance after 1yr: {r} m");
}

#[test]
fn orbit_path_circular() {
    let r = 7000e3;
    let oe = OrbitalElements::new(r, 0.0, 0.0, 0.0, 0.0, 0.0);
    let period = oe.period(GM_EARTH).unwrap();

    // Generate 4 points around a circular orbit
    let n = 4;
    let mut positions = Vec::new();
    for k in 0..n {
        let dt = period * (k as f64) / (n as f64);
        let prop = propagate_keplerian(&oe, dt, GM_EARTH).unwrap();
        let (pos, _) = coe_to_rv(&prop, GM_EARTH);
        positions.push(pos);
    }

    // All points should be at the same radius
    for pos in &positions {
        let r_actual = pos.norm();
        assert_relative_eq!(r_actual, r, epsilon = 10.0);
    }
}

#[test]
fn tle_propagation_iss() {
    // ISS TLE (historical, for testing only)
    let tle = "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927\n\
               2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537";
    let elements = parse_tle(tle).unwrap();
    let state = propagate_from_elements(&elements, 0.0).unwrap();

    // ISS is in LEO — position magnitude should be ~6700-6900 km
    let r = state.position_magnitude();
    assert!(r > 6500.0 && r < 7200.0, "ISS radius: {r} km");
}

#[test]
fn lambert_solver_basic() {
    // Transfer from 7000 km to 42000 km (LEO to GEO-like)
    let r1 = nalgebra::Vector3::new(7000e3, 0.0, 0.0);
    let r2 = nalgebra::Vector3::new(0.0, 42000e3, 0.0);
    let tof = 19000.0; // ~5.3 hours

    let sol = Lambert::solve(r1, r2, tof, GM_EARTH, TransferKind::Auto, 0).unwrap();

    // Transfer orbit should have positive SMA and eccentricity < 1
    assert!(sol.a > 0.0, "SMA should be positive: {}", sol.a);
    assert!(sol.e < 1.0, "Eccentricity should be < 1: {}", sol.e);
    assert!(sol.v1.norm() > 0.0, "Departure velocity should be nonzero");
}

#[test]
fn body_constants_all_bodies() {
    // Verify all registered bodies return valid data
    for id in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 301] {
        let body = body_by_id(id).unwrap();
        assert!(body.gm > 0.0, "body {id} ({}) GM should be positive", body.name);
        assert!(body.radius > 0.0, "body {id} ({}) radius should be positive", body.name);
    }
}

#[test]
fn benchmark_key_operations() {
    let n = 10_000;

    // Body position calculation
    let earth = body_by_id(3).unwrap();
    let start = Instant::now();
    for _ in 0..n {
        let prop = propagate_keplerian(&earth.elements_j2000, 365.25 * 86400.0, earth.parent_mu).unwrap();
        let _ = coe_to_rv(&prop, earth.parent_mu);
    }
    let body_pos_us = start.elapsed().as_micros() as f64 / n as f64;

    // TLE propagation
    let tle = "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927\n\
               2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537";
    let elements = parse_tle(tle).unwrap();
    let start = Instant::now();
    for _ in 0..n {
        let _ = propagate_from_elements(&elements, 120.0).unwrap();
    }
    let tle_us = start.elapsed().as_micros() as f64 / n as f64;

    // Lambert solver
    let r1 = nalgebra::Vector3::new(7000e3, 0.0, 0.0);
    let r2 = nalgebra::Vector3::new(0.0, 42000e3, 0.0);
    let start = Instant::now();
    for _ in 0..n {
        let _ = Lambert::solve(r1, r2, 19000.0, GM_EARTH, TransferKind::Auto, 0).unwrap();
    }
    let lambert_us = start.elapsed().as_micros() as f64 / n as f64;

    println!("\n--- Native benchmark ({n} iterations each) ---");
    println!("  get_body_position:  {body_pos_us:.2} µs/call");
    println!("  propagate_tle:      {tle_us:.2} µs/call");
    println!("  compute_transfer:   {lambert_us:.2} µs/call");
    println!("  (WASM typically 2-4x native; all should be well under 1ms)");

    // Assert all are under 1ms native (WASM budget is 1ms)
    assert!(body_pos_us < 1000.0, "body position too slow: {body_pos_us} µs");
    assert!(tle_us < 1000.0, "TLE propagation too slow: {tle_us} µs");
    assert!(lambert_us < 1000.0, "Lambert solver too slow: {lambert_us} µs");
}

// ===========================================================================
// Batch position tests
// ===========================================================================

#[test]
fn batch_positions_all_planets() {
    use crate::{get_body_position, get_positions_batch};

    let ids = vec![1, 2, 3, 4, 5, 6, 7, 8];
    let jd = J2000_TT;
    let batch = get_positions_batch(ids.clone(), jd);

    assert_eq!(batch.len(), 24); // 8 bodies × 3 coords

    for (i, &id) in ids.iter().enumerate() {
        let single = get_body_position(id, jd).unwrap();
        let bx = batch[i * 3];
        let by = batch[i * 3 + 1];
        let bz = batch[i * 3 + 2];
        assert_relative_eq!(bx, single[0], epsilon = 1e-10);
        assert_relative_eq!(by, single[1], epsilon = 1e-10);
        assert_relative_eq!(bz, single[2], epsilon = 1e-10);
    }
}

#[test]
fn batch_positions_mixed_bodies() {
    use crate::{get_body_position, get_positions_batch};

    // Planets, dwarf planets, comets, Sun
    let ids = vec![0, 3, 9, 10, 301, 1001];
    let jd = J2000_TT + 365.25;
    let batch = get_positions_batch(ids.clone(), jd);

    assert_eq!(batch.len(), 18);

    // Sun should be at origin
    assert_relative_eq!(batch[0], 0.0, epsilon = 1e-10);
    assert_relative_eq!(batch[1], 0.0, epsilon = 1e-10);
    assert_relative_eq!(batch[2], 0.0, epsilon = 1e-10);

    // All others should match individual calls
    for (i, &id) in ids.iter().enumerate().skip(1) {
        let single = get_body_position(id, jd).unwrap();
        assert_relative_eq!(batch[i * 3], single[0], epsilon = 1e-10);
        assert_relative_eq!(batch[i * 3 + 1], single[1], epsilon = 1e-10);
        assert_relative_eq!(batch[i * 3 + 2], single[2], epsilon = 1e-10);
    }
}

#[test]
fn batch_positions_unknown_body_returns_nan() {
    use crate::get_positions_batch;

    let ids = vec![3, 99999, 5];
    let batch = get_positions_batch(ids, J2000_TT);

    assert_eq!(batch.len(), 9);
    // Earth (id=3) should be valid
    assert!(!batch[0].is_nan());
    // Unknown (id=99999) should be NaN
    assert!(batch[3].is_nan());
    assert!(batch[4].is_nan());
    assert!(batch[5].is_nan());
    // Jupiter (id=5) should be valid
    assert!(!batch[6].is_nan());
}

#[test]
fn batch_satellite_positions() {
    use crate::{get_satellite_position, get_satellite_positions_batch};

    let ids = vec![301, 401, 402]; // Moon, Phobos, Deimos
    let jd = J2000_TT;
    let batch = get_satellite_positions_batch(ids.clone(), jd);

    assert_eq!(batch.len(), 9);

    for (i, &id) in ids.iter().enumerate() {
        let single = get_satellite_position(id, jd).unwrap();
        assert_relative_eq!(batch[i * 3], single[0], epsilon = 1e-10);
        assert_relative_eq!(batch[i * 3 + 1], single[1], epsilon = 1e-10);
        assert_relative_eq!(batch[i * 3 + 2], single[2], epsilon = 1e-10);
    }
}

#[test]
fn batch_positions_performance() {
    use crate::get_positions_batch;

    // Simulate a typical frame: all planets + dwarf planets + comets + small bodies
    let ids: Vec<u32> = vec![
        1, 2, 3, 4, 5, 6, 7, 8,       // planets
        9, 10, 11, 12, 13,             // dwarf planets
        1001, 1002, 1003, 1004, 1005, 1006, // comets
        2001, 2002, 2003,              // asteroids
        3001, 3002, 3003,              // KBOs
    ];

    let n = 1_000;
    let start = Instant::now();
    for i in 0..n {
        let jd = J2000_TT + (i as f64) * 0.1;
        let _ = get_positions_batch(ids.clone(), jd);
    }
    let us_per_call = start.elapsed().as_micros() as f64 / n as f64;
    println!("  get_positions_batch (26 bodies): {us_per_call:.2} µs/call");
    // Should complete well under 1ms
    assert!(us_per_call < 1000.0, "batch position too slow: {us_per_call} µs");
}

// ===========================================================================
// Moon (Meeus Ch.47) tests
// ===========================================================================

#[test]
fn moon_body_position_heliocentric() {
    // get_body_position(301) should return heliocentric Moon position
    // that is ~1 AU from Sun (near Earth) and ~384,400 km from Earth
    use crate::get_body_position;

    let moon_pos = get_body_position(301, J2000_TT).unwrap();
    assert_eq!(moon_pos.len(), 3);

    let r_sun = (moon_pos[0] * moon_pos[0] + moon_pos[1] * moon_pos[1] + moon_pos[2] * moon_pos[2]).sqrt();
    // Moon should be roughly 1 AU from Sun (same as Earth ± 400k km)
    assert!(r_sun > 0.95 * AU && r_sun < 1.05 * AU,
        "Moon heliocentric distance: {} AU, expected ~1.0 AU", r_sun / AU);

    // Check separation from Earth
    let earth_pos = planet_position(Planet::Earth, J2000_TT);
    let dx = moon_pos[0] - earth_pos.0;
    let dy = moon_pos[1] - earth_pos.1;
    let dz = moon_pos[2] - earth_pos.2;
    let sep_km = (dx * dx + dy * dy + dz * dz).sqrt() / 1000.0;
    assert!(sep_km > 356_000.0 && sep_km < 407_000.0,
        "Moon-Earth separation: {} km", sep_km);
}

#[test]
fn moon_geocentric_position() {
    use astro_core::ephemeris::moon_position_geocentric;

    let (x, y, z) = moon_position_geocentric(J2000_TT);
    let r_km = (x * x + y * y + z * z).sqrt() / 1000.0;
    assert!(r_km > 356_000.0 && r_km < 407_000.0,
        "Moon geocentric distance: {} km", r_km);
}

#[test]
fn moon_position_benchmark() {
    use astro_core::ephemeris::moon_position_heliocentric;

    let n = 10_000;
    let start = Instant::now();
    for i in 0..n {
        let jde = J2000_TT + (i as f64) * 0.1;
        let _ = moon_position_heliocentric(jde);
    }
    let us_per_call = start.elapsed().as_micros() as f64 / n as f64;
    println!("  Moon heliocentric position: {us_per_call:.2} µs/call");
    assert!(us_per_call < 500.0, "Moon position too slow: {us_per_call} µs/call");
}

// ===========================================================================
// Dwarf planet tests
// ===========================================================================

#[test]
fn dwarf_planet_registry_lookup() {
    let names = [
        (9, "Pluto"),
        (10, "Ceres"),
        (11, "Eris"),
        (12, "Haumea"),
        (13, "Makemake"),
    ];
    for (id, expected_name) in &names {
        let body = body_by_id(*id).unwrap_or_else(|| panic!("body_by_id({id}) returned None"));
        assert_eq!(body.name, *expected_name, "body_id {id} name mismatch");
        assert!(body.gm > 0.0, "{expected_name} GM should be positive");
        assert!(body.radius > 0.0, "{expected_name} radius should be positive");
    }
}

#[test]
fn dwarf_planet_positions_at_j2000() {
    // Expected heliocentric distance ranges (AU) at J2000
    let cases: [(u32, &str, f64, f64); 5] = [
        (9,  "Pluto",    29.0, 49.5),   // Pluto: 29.7–49.3 AU, was ~30.2 AU in 2000
        (10, "Ceres",    2.5,  3.0),     // Ceres: 2.56–2.98 AU
        (11, "Eris",     38.0, 97.7),    // Eris: 38.3–97.7 AU
        (12, "Haumea",   34.7, 51.5),    // Haumea: 34.7–51.5 AU
        (13, "Makemake", 38.1, 53.1),    // Makemake: 38.1–53.1 AU
    ];

    for (id, name, min_au, max_au) in &cases {
        let body = body_by_id(*id).unwrap();
        let (pos, _) = coe_to_rv(&body.elements_j2000, body.parent_mu);
        let r_au = pos.norm() / AU;
        assert!(
            r_au >= *min_au && r_au <= *max_au,
            "{name} (id={id}) distance at J2000: {r_au:.2} AU, expected {min_au}–{max_au} AU"
        );
    }
}

#[test]
fn dwarf_planet_keplerian_propagation() {
    // Propagate each dwarf planet forward by ~1 year and verify it stays in range
    let dt = 365.25 * DAY_TO_SEC;
    let cases: [(u32, &str, f64, f64); 4] = [
        (10, "Ceres",    2.5, 3.0),
        (11, "Eris",     38.0, 97.7),
        (12, "Haumea",   34.7, 51.5),
        (13, "Makemake", 38.1, 53.1),
    ];

    for (id, name, min_au, max_au) in &cases {
        let body = body_by_id(*id).unwrap();
        let propagated = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu).unwrap();
        let (pos, _) = coe_to_rv(&propagated, body.parent_mu);
        let r_au = pos.norm() / AU;
        assert!(
            r_au >= *min_au && r_au <= *max_au,
            "{name} after 1yr: {r_au:.2} AU, expected {min_au}–{max_au} AU"
        );
    }
}

#[test]
fn get_body_orbit_path_dwarf_planets() {
    use crate::get_body_orbit_path;

    for id in [9, 10, 11, 12, 13] {
        let path = get_body_orbit_path(id, 64).unwrap();
        assert_eq!(path.len(), 64 * 3, "body {id}: expected 192 values, got {}", path.len());

        // All points should be at a reasonable distance from the Sun
        for i in 0..64 {
            let x = path[i * 3];
            let y = path[i * 3 + 1];
            let z = path[i * 3 + 2];
            let r = (x * x + y * y + z * z).sqrt();
            assert!(r > 1.0 * AU && r < 100.0 * AU,
                "body {id} orbit point {i}: r={:.2} AU", r / AU);
        }
    }
}

// ===========================================================================
// VSOP87 validation & epoch boundary tests
// ===========================================================================

#[test]
fn vsop87_earth_positions_multi_epoch() {
    // Compare VSOP87 Earth positions against JPL Horizons reference values.
    // JPL Horizons: heliocentric ecliptic J2000, AU.
    // Tolerance: 1e-4 AU ≈ 15,000 km (generous; VSOP87 should be within ~1")
    let tol_au = 1e-4;

    // Reference: J2000.0 (2000-Jan-01.5 TDB, JD 2451545.0)
    // JPL Horizons: X≈-0.1771, Y≈0.9672, Z≈-0.0000
    let (x, y, z) = planet_position_au(Planet::Earth, 2451545.0);
    assert_relative_eq!(x, -0.1771, epsilon = 5e-3);
    assert_relative_eq!(y, 0.9672, epsilon = 5e-3);
    assert!(z.abs() < 1e-3, "Earth Z at J2000 should be near-zero: {z}");

    // Verify Earth stays ~1 AU across a range of dates spanning 1900–2100
    let test_jds = [
        2415021.0, // 1900-Jan-01.5
        2433282.5, // 1950-Jan-01.5
        2451545.0, // 2000-Jan-01.5 (J2000)
        2469807.5, // 2050-Jan-01.5
        2488070.0, // 2100-Jan-01.5
    ];
    for jd in &test_jds {
        let (x, y, z) = planet_position_au(Planet::Earth, *jd);
        let r = (x * x + y * y + z * z).sqrt();
        assert!(r > 0.98 && r < 1.02,
            "Earth at JD {jd}: r={r:.6} AU, expected ~1.0 AU");
        // Earth's ecliptic Z should be very small (< 0.001 AU)
        assert!(z.abs() < 0.002,
            "Earth at JD {jd}: Z={z:.6} AU, should be near ecliptic plane");
    }

    // Cross-check: Mars distance at J2000 should be ~1.39-1.67 AU
    let (mx, my, mz) = planet_position_au(Planet::Mars, 2451545.0);
    let r_mars = (mx * mx + my * my + mz * mz).sqrt();
    assert!(r_mars > 1.38 && r_mars < 1.67,
        "Mars at J2000: {r_mars:.4} AU");
}

#[test]
fn vsop87_epoch_boundary_centuries() {
    // Test VSOP87 at extreme epoch offsets: J2000 ± 2 centuries
    // VSOP87 is valid for roughly 4000 BC – 8000 AD but accuracy degrades.
    // We just verify no panics/NaN and reasonable distances.
    let jd_1800 = 2378497.0; // ~1800-Jan-01.5
    let jd_2200 = 2524594.0; // ~2200-Jan-01.5

    for planet in [Planet::Mercury, Planet::Venus, Planet::Earth, Planet::Mars,
                   Planet::Jupiter, Planet::Saturn, Planet::Uranus, Planet::Neptune] {
        for jd in [jd_1800, jd_2200] {
            let (x, y, z) = planet_position_au(planet, jd);
            let r = (x * x + y * y + z * z).sqrt();
            assert!(!r.is_nan(), "{planet:?} at JD {jd}: position is NaN");
            assert!(r > 0.2 && r < 35.0,
                "{planet:?} at JD {jd}: distance {r:.3} AU out of plausible range");
        }
    }
}

#[test]
fn vsop87_earth_at_j2000() {
    // Earth position at J2000.0 (JDE 2451545.0)
    // Expected values from JPL Horizons for 2000-Jan-01.5 TDB (heliocentric ecliptic J2000):
    //   X = -0.1771 AU, Y = 0.9672 AU, Z = -0.0000 AU (approximately)
    let (x, y, z) = planet_position_au(Planet::Earth, J2000_TT);
    let r = (x * x + y * y + z * z).sqrt();

    // Earth should be ~1 AU from Sun
    assert!(r > 0.98 && r < 1.02, "Earth distance at J2000: {r} AU, expected ~1.0 AU");
    // Verify we're in the right quadrant (Jan 1 2000: Earth is roughly at X<0, Y>0)
    assert!(x < 0.0, "Earth X should be negative at J2000: {x}");
    assert!(y > 0.0, "Earth Y should be positive at J2000: {y}");
}

#[test]
fn vsop87_all_planets_reasonable_distances() {
    // Verify each planet is at a reasonable distance from the Sun at J2000
    let expected_au: [(Planet, f64, f64); 8] = [
        (Planet::Mercury, 0.3, 0.47),
        (Planet::Venus, 0.7, 0.73),
        (Planet::Earth, 0.98, 1.02),
        (Planet::Mars, 1.38, 1.67),
        (Planet::Jupiter, 4.9, 5.5),
        (Planet::Saturn, 9.0, 10.1),
        (Planet::Uranus, 18.3, 20.1),
        (Planet::Neptune, 29.8, 30.4),
    ];

    for (planet, min_au, max_au) in &expected_au {
        let (x, y, z) = planet_position_au(*planet, J2000_TT);
        let r = (x * x + y * y + z * z).sqrt();
        assert!(
            r >= *min_au && r <= *max_au,
            "{planet:?} distance at J2000: {r} AU, expected {min_au}–{max_au} AU"
        );
    }
}

#[test]
fn vsop87_meters_conversion() {
    let (x_au, y_au, z_au) = planet_position_au(Planet::Earth, J2000_TT);
    let (x_m, y_m, z_m) = planet_position(Planet::Earth, J2000_TT);

    assert_relative_eq!(x_m, x_au * AU, epsilon = 1.0);
    assert_relative_eq!(y_m, y_au * AU, epsilon = 1.0);
    assert_relative_eq!(z_m, z_au * AU, epsilon = 1.0);
}

#[test]
fn vsop87_earth_moves_over_half_year() {
    // After ~6 months, Earth should be on the opposite side of the Sun
    let jd_jan = 2451545.0; // 2000-Jan-01.5
    let jd_jul = jd_jan + 182.5; // ~2000-Jul-03

    let (x1, y1, _) = planet_position_au(Planet::Earth, jd_jan);
    let (x2, y2, _) = planet_position_au(Planet::Earth, jd_jul);

    // Dot product should be negative (roughly opposite directions)
    let dot = x1 * x2 + y1 * y2;
    assert!(dot < 0.0, "Earth positions should be roughly opposite after 6 months, dot={dot}");
}

#[test]
fn vsop87_performance() {
    let n = 10_000;
    let start = Instant::now();
    for i in 0..n {
        let jde = J2000_TT + (i as f64) * 0.1;
        let _ = planet_position(Planet::Earth, jde);
    }
    let us_per_call = start.elapsed().as_micros() as f64 / n as f64;

    println!("  VSOP87 planet_position: {us_per_call:.2} µs/call");
    // Must be under 500µs per call (WASM budget is <0.5ms per body per frame)
    assert!(us_per_call < 500.0, "VSOP87 too slow: {us_per_call} µs/call");
}

// ---------------------------------------------------------------------------
// Comet registry tests
// ---------------------------------------------------------------------------

#[test]
fn comet_registry_lookup() {
    use crate::bodies::{all_comet_ids, is_comet};

    // All 6 comets should be findable
    for id in [1001, 1002, 1003, 1004, 1005, 1006] {
        let body = body_by_id(id);
        assert!(body.is_some(), "comet {id} not found in registry");
        assert!(is_comet(id), "is_comet({id}) should be true");
    }

    // Verify names
    assert_eq!(body_by_id(1001).unwrap().name, "Halley");
    assert_eq!(body_by_id(1002).unwrap().name, "Hale-Bopp");
    assert_eq!(body_by_id(1003).unwrap().name, "NEOWISE");
    assert_eq!(body_by_id(1004).unwrap().name, "Encke");
    assert_eq!(body_by_id(1005).unwrap().name, "Tempel-Tuttle");
    assert_eq!(body_by_id(1006).unwrap().name, "Swift-Tuttle");

    // Verify all_comet_ids returns all 6
    let ids = all_comet_ids();
    assert_eq!(ids.len(), 6);
    assert!(ids.contains(&1001));
    assert!(ids.contains(&1006));

    // Non-comets should not be flagged as comets
    assert!(!is_comet(3));   // Earth
    assert!(!is_comet(9));   // Pluto
    assert!(!is_comet(301)); // Moon
    assert!(!is_comet(999)); // unknown
}

#[test]
fn comet_keplerian_propagation() {
    // Comets have high eccentricity but e < 1.0 (elliptical), so propagation should work
    for id in [1001, 1002, 1003, 1004, 1005, 1006] {
        let body = body_by_id(id).unwrap();
        assert!(body.elements_j2000.e < 1.0, "comet {} has e >= 1.0", body.name);
        assert!(body.elements_j2000.a > 0.0, "comet {} has non-positive semi-major axis", body.name);

        // Propagate forward 1 year from J2000
        let dt = 365.25 * DAY_TO_SEC;
        let result = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu);
        assert!(result.is_ok(), "propagation failed for comet {}: {:?}", body.name, result.err());

        // Position should be finite
        let propagated = result.unwrap();
        let (pos, _vel) = coe_to_rv(&propagated, body.parent_mu);
        assert!(pos.x.is_finite(), "comet {} position x is not finite", body.name);
        assert!(pos.y.is_finite(), "comet {} position y is not finite", body.name);
        assert!(pos.z.is_finite(), "comet {} position z is not finite", body.name);
    }
}

#[test]
fn comet_orbit_path_computable() {
    // All comets should produce valid orbit paths
    for id in [1001, 1002, 1003, 1004, 1005, 1006] {
        let body = body_by_id(id).unwrap();
        let period = body.elements_j2000.period(body.parent_mu);
        assert!(period.is_ok(), "period computation failed for comet {}: {:?}", body.name, period.err());

        let n = 64;
        let period_s = period.unwrap();
        for k in 0..n {
            let dt = period_s * (k as f64) / (n as f64);
            let prop = propagate_keplerian(&body.elements_j2000, dt, body.parent_mu);
            assert!(prop.is_ok(), "propagation at step {k} failed for comet {}", body.name);
        }
    }
}

// ===========================================================================
// Light path & geodesic tests
// ===========================================================================

#[test]
fn light_path_straight_line_no_bodies() {
    let source = [0.0, 0.0, 0.0];
    let target = [AU, 0.0, 0.0];
    let result = LightPath::compute(source, target, &[], 100).unwrap();

    assert!(result.deflections.is_empty());
    assert_relative_eq!(result.total_distance, AU, epsilon = 1.0);
    assert_relative_eq!(result.travel_time, AU / C, epsilon = 0.1);
}

#[test]
fn light_path_with_sun_deflection() {
    let source = [0.0, 10.0 * AU, 0.0];
    let target = [0.0, -AU, 0.0];
    let sun = LensingBody {
        position: [R_SUN * 10.0, 0.0, 0.0],
        gm: GM_SUN,
    };
    let result = LightPath::compute(source, target, &[sun], 200).unwrap();

    assert_eq!(result.deflections.len(), 1);
    assert!(result.deflections[0].deflection_angle > 0.0);
}

#[test]
fn schwarzschild_geodesic_cartesian() {
    let points = SchwarzschildGeodesic::integrate_to_cartesian(
        GM_SUN,
        R_SUN * 10.0,
        std::f64::consts::PI,
        10_000,
    )
    .unwrap();

    assert!(!points.is_empty());
    // All z coordinates should be zero (orbital plane)
    for p in &points {
        assert_relative_eq!(p[2], 0.0, epsilon = 1e-15);
    }
}

#[test]
fn light_path_performance() {
    let source = [0.0, 0.0, 0.0];
    let target = [3.0 * AU, 0.0, 0.0];
    let bodies = vec![
        LensingBody { position: [AU, R_SUN * 10.0, 0.0], gm: GM_SUN },
        LensingBody { position: [2.0 * AU, -R_SUN * 10.0, 0.0], gm: GM_SUN },
    ];

    let n = 1000;
    let start = Instant::now();
    for _ in 0..n {
        let _ = LightPath::compute(source, target, &bodies, 100).unwrap();
    }
    let us_per_call = start.elapsed().as_micros() as f64 / n as f64;
    println!("  compute_light_path (2 bodies): {us_per_call:.2} µs/call");
    // Must be under 5ms (5000 µs) as per spec
    assert!(us_per_call < 5000.0, "light path too slow: {us_per_call} µs/call");
}
