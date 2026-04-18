//! Solar-system body registry with J2000 reference orbital elements.
//!
//! Orbital elements are J2000.0 ecliptic heliocentric values from JPL
//! "Keplerian Elements for Approximate Positions of the Major Planets"
//! (Standish, 1992 / JPL Solar System Dynamics).
//!
//! These give ~arcminute-level accuracy over ±3000 years from J2000 and are
//! sufficient for visualization; Phase 03 (VSOP87) will provide full precision.

use astro_core::core::constants::*;
// Moon constants used: GM_MOON, R_MOON, R_MEAN_MOON, GM_EARTH,
// GM_PHOBOS, R_PHOBOS, GM_DEIMOS, R_DEIMOS,
// GM_IO, R_IO, GM_EUROPA, R_EUROPA, GM_GANYMEDE, R_GANYMEDE, GM_CALLISTO, R_CALLISTO,
// GM_ENCELADUS, R_ENCELADUS, GM_TITAN, R_TITAN,
// GM_MIRANDA, R_MIRANDA, GM_TRITON, R_TRITON, GM_CHARON, R_CHARON,
// GM_MARS, GM_JUPITER, GM_SATURN, GM_URANUS, GM_NEPTUNE, GM_PLUTO
use astro_core::core::elements::OrbitalElements;
use std::f64::consts::PI;

/// Static data for a solar-system body.
pub struct BodyData {
    pub name: &'static str,
    /// Standard gravitational parameter GM (m³/s²)
    pub gm: f64,
    /// Equatorial radius (m)
    pub radius: f64,
    /// Mean radius (m)
    pub radius_mean: f64,
    /// Parent body GM for orbital propagation (m³/s²)
    pub parent_mu: f64,
    /// J2000.0 ecliptic heliocentric Keplerian elements
    pub elements_j2000: OrbitalElements,
}

fn deg_to_rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

fn make_body(
    name: &'static str,
    gm: f64,
    radius: f64,
    radius_mean: f64,
    parent_mu: f64,
    a: f64,
    e: f64,
    i_deg: f64,
    raan_deg: f64,
    argp_deg: f64,
    nu_deg: f64,
) -> BodyData {
    BodyData {
        name,
        gm,
        radius,
        radius_mean,
        parent_mu,
        elements_j2000: OrbitalElements::new(
            a,
            e,
            deg_to_rad(i_deg),
            deg_to_rad(raan_deg),
            deg_to_rad(argp_deg),
            deg_to_rad(nu_deg),
        ),
    }
}

/// JPL approximate Keplerian elements at J2000.0 (ecliptic, heliocentric).
/// Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html
///
/// Body IDs follow a simplified NAIF scheme:
///   0 = Sun, 1 = Mercury, 2 = Venus, 3 = Earth–Moon barycenter,
///   4 = Mars, 5 = Jupiter, 6 = Saturn, 7 = Uranus, 8 = Neptune,
///   9 = Pluto, 301 = Moon
fn build_registry() -> Vec<BodyData> {
    vec![
        // 0: Sun (placeholder — at origin in heliocentric frame)
        make_body("Sun", GM_SUN, R_SUN, R_MEAN_SUN, 0.0,
                  0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
        // 1: Mercury
        make_body("Mercury", GM_MERCURY, R_MERCURY, R_MEAN_MERCURY, GM_SUN,
                  A_MERCURY, 0.20563593, 7.00497902, 48.33076593, 77.45779628, 174.796),
        // 2: Venus
        make_body("Venus", GM_VENUS, R_VENUS, R_MEAN_VENUS, GM_SUN,
                  A_VENUS, 0.00677672, 3.39467605, 76.67984255, 131.60246718, 50.115),
        // 3: Earth (EMB)
        make_body("Earth", GM_EARTH, R_EARTH, R_MEAN_EARTH, GM_SUN,
                  A_EARTH, 0.01671123, 0.00001531, -11.26064, 102.93768193, 357.51716),
        // 4: Mars
        make_body("Mars", GM_MARS, R_MARS, R_MEAN_MARS, GM_SUN,
                  A_MARS, 0.09339410, 1.84969142, 49.55953891, 336.04084, 19.373),
        // 5: Jupiter
        make_body("Jupiter", GM_JUPITER, R_JUPITER, R_MEAN_JUPITER, GM_SUN,
                  A_JUPITER, 0.04838624, 1.30439695, 100.47390909, 14.72847983, 20.020),
        // 6: Saturn
        make_body("Saturn", GM_SATURN, R_SATURN, R_MEAN_SATURN, GM_SUN,
                  A_SATURN, 0.05386179, 2.48599187, 113.66242448, 92.59887831, 317.020),
        // 7: Uranus
        make_body("Uranus", GM_URANUS, R_URANUS, R_MEAN_URANUS, GM_SUN,
                  A_URANUS, 0.04725744, 0.77263783, 74.01692503, 170.95427630, 142.238),
        // 8: Neptune
        make_body("Neptune", GM_NEPTUNE, R_NEPTUNE, R_MEAN_NEPTUNE, GM_SUN,
                  A_NEPTUNE, 0.00859048, 1.77004347, 131.78422574, 44.96476227, 256.228),
        // 9: Pluto
        make_body("Pluto", GM_PLUTO, R_PLUTO, R_MEAN_PLUTO, GM_SUN,
                  5.906_440_628_3e12, 0.24882730, 17.14001206, 110.30393684, 224.06891629, 14.53),
        // 10: Ceres — JPL SBDB osculating elements at J2000.0
        make_body("Ceres", GM_CERES, R_CERES, R_MEAN_CERES, GM_SUN,
                  A_CERES, 0.07554, 10.594, 80.329, 73.597, 85.964),
        // 11: Eris — JPL SBDB osculating elements at J2000.0
        make_body("Eris", GM_ERIS, R_ERIS, R_MEAN_ERIS, GM_SUN,
                  A_ERIS, 0.44068, 44.040, 35.875, 151.639, 191.355),
        // 12: Haumea — JPL SBDB osculating elements at J2000.0
        make_body("Haumea", GM_HAUMEA, R_HAUMEA, R_MEAN_HAUMEA, GM_SUN,
                  A_HAUMEA, 0.19520, 28.213, 121.900, 239.041, 206.683),
        // 13: Makemake — JPL SBDB osculating elements at J2000.0
        make_body("Makemake", GM_MAKEMAKE, R_MAKEMAKE, R_MEAN_MAKEMAKE, GM_SUN,
                  A_MAKEMAKE, 0.16126, 28.998, 79.382, 296.534, 161.933),
    ]
}

/// Moon — geocentric J2000 ecliptic elements (approximate).
fn build_moon() -> BodyData {
    make_body(
        "Moon", GM_MOON, R_MOON, R_MEAN_MOON, GM_EARTH,
        3.844e8,          // a ≈ 384,400 km
        0.0549,           // e
        5.145,            // i (deg)
        125.08,           // raan (deg) — regresses with 18.6-yr period
        318.15,           // argp (deg)
        135.27,           // nu (deg) — at J2000
    )
}

/// Major moons registry.
///
/// Orbital elements are approximate ecliptic-referenced J2000 Keplerian elements.
/// Inclinations account for the parent planet's obliquity relative to the ecliptic.
///
/// Sources:
/// - JPL Planetary Satellite Physical Parameters
/// - Lieske E5 (Galilean moons mean longitudes at J2000)
/// - JPL SAT441, URA111, NEP097, MAR097 ephemerides
fn build_moons() -> Vec<(u32, BodyData)> {
    vec![
        // ---------------------------------------------------------------
        // Mars moons (401–402)
        // Mars obliquity 25.19° + orbit incl 1.85° ≈ 26° ecliptic incl
        // ---------------------------------------------------------------
        (401, make_body(
            "Phobos", GM_PHOBOS, R_PHOBOS, R_PHOBOS, GM_MARS,
            9.376e6,      // a = 9,376 km
            0.0151,       // e
            26.04,        // i (deg, ecliptic-referenced)
            82.0,         // raan (deg, approximate)
            0.0,          // argp (deg)
            90.0,         // nu (deg, approximate at J2000)
        )),
        (402, make_body(
            "Deimos", GM_DEIMOS, R_DEIMOS, R_DEIMOS, GM_MARS,
            2.3463e7,     // a = 23,463 km
            0.0002,       // e
            26.04,        // i (deg, ecliptic-referenced)
            82.0,         // raan (deg, approximate)
            0.0,          // argp (deg)
            270.0,        // nu (deg, spread from Phobos)
        )),
        // ---------------------------------------------------------------
        // Galilean moons (501–504)
        // Jupiter obliquity 3.13° + orbit incl 1.30° ≈ 2° ecliptic incl
        // True anomalies from Lieske E5 mean longitudes at J2000
        // ---------------------------------------------------------------
        (501, make_body(
            "Io", GM_IO, R_IO, R_IO, GM_JUPITER,
            4.2180e8,     // a = 421,800 km
            0.0041,       // e
            2.21,         // i (deg, ecliptic-referenced)
            337.0,        // raan (deg, approximate)
            0.0,          // argp (deg)
            106.1,        // nu (deg, from Lieske mean longitude at J2000)
        )),
        (502, make_body(
            "Europa", GM_EUROPA, R_EUROPA, R_EUROPA, GM_JUPITER,
            6.7110e8,     // a = 671,100 km
            0.0094,       // e
            2.68,         // i (deg, ecliptic-referenced)
            337.0,        // raan (deg, approximate)
            0.0,          // argp (deg)
            175.7,        // nu (deg, from Lieske mean longitude at J2000)
        )),
        (503, make_body(
            "Ganymede", GM_GANYMEDE, R_GANYMEDE, R_GANYMEDE, GM_JUPITER,
            1.07040e9,    // a = 1,070,400 km
            0.0013,       // e
            2.30,         // i (deg, ecliptic-referenced)
            337.0,        // raan (deg, approximate)
            0.0,          // argp (deg)
            120.6,        // nu (deg, from Lieske mean longitude at J2000)
        )),
        (504, make_body(
            "Callisto", GM_CALLISTO, R_CALLISTO, R_CALLISTO, GM_JUPITER,
            1.88270e9,    // a = 1,882,700 km
            0.0074,       // e
            2.02,         // i (deg, ecliptic-referenced)
            337.0,        // raan (deg, approximate)
            0.0,          // argp (deg)
            85.0,         // nu (deg, from Lieske mean longitude at J2000)
        )),
        // ---------------------------------------------------------------
        // Saturn moons (601–606)
        // Saturn obliquity 26.73° + orbit incl 2.49° ≈ 27° ecliptic incl
        // ---------------------------------------------------------------
        (602, make_body(
            "Enceladus", GM_ENCELADUS, R_ENCELADUS, R_ENCELADUS, GM_SATURN,
            2.38042e8,    // a = 238,042 km
            0.0047,       // e
            28.0,         // i (deg, ecliptic-referenced)
            169.5,        // raan (deg, approximate from Saturn pole)
            0.0,          // argp (deg)
            200.0,        // nu (deg, approximate)
        )),
        (606, make_body(
            "Titan", GM_TITAN, R_TITAN, R_TITAN, GM_SATURN,
            1.22187e9,    // a = 1,221,870 km
            0.0288,       // e
            27.7,         // i (deg, ecliptic-referenced)
            169.5,        // raan (deg, approximate from Saturn pole)
            180.0,        // argp (deg)
            120.0,        // nu (deg, approximate)
        )),
        // ---------------------------------------------------------------
        // Uranus moons (705)
        // Uranus obliquity 97.77° — moons orbit nearly perpendicular to ecliptic
        // ---------------------------------------------------------------
        (705, make_body(
            "Miranda", GM_MIRANDA, R_MIRANDA, R_MIRANDA, GM_URANUS,
            1.299e8,      // a = 129,900 km
            0.0013,       // e
            97.3,         // i (deg, ecliptic-referenced — Uranus's extreme tilt!)
            167.6,        // raan (deg, approximate from Uranus pole)
            0.0,          // argp (deg)
            180.0,        // nu (deg, approximate)
        )),
        // ---------------------------------------------------------------
        // Neptune moons (801)
        // Triton orbits retrograde (i > 90°)
        // ---------------------------------------------------------------
        (801, make_body(
            "Triton", GM_TRITON, R_TRITON, R_TRITON, GM_NEPTUNE,
            3.54759e8,    // a = 354,759 km
            0.000016,     // e (nearly circular)
            130.0,        // i (deg, ecliptic-referenced — retrograde!)
            177.0,        // raan (deg, approximate)
            0.0,          // argp (deg)
            264.0,        // nu (deg, approximate)
        )),
        // ---------------------------------------------------------------
        // Pluto moons (901)
        // Pluto obliquity 122.53° (retrograde) + orbit incl 17.14°
        // ---------------------------------------------------------------
        (901, make_body(
            "Charon", GM_CHARON, R_CHARON, R_CHARON, GM_PLUTO,
            1.9591e7,     // a = 19,591 km
            0.0002,       // e (nearly circular)
            119.6,        // i (deg, ecliptic-referenced)
            227.0,        // raan (deg, approximate)
            0.0,          // argp (deg)
            0.0,          // nu (deg, approximate)
        )),
    ]
}

/// Notable asteroids registry.
///
/// Orbital elements are ecliptic heliocentric J2000 osculating elements from
/// JPL Small-Body Database.
///
/// Asteroid IDs use a custom scheme starting at 2001.
///
/// Sources:
/// - JPL SBDB: https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html
fn build_asteroids() -> Vec<(u32, BodyData)> {
    vec![
        // 2001: 4 Vesta — second-largest asteroid, Dawn mission target
        // Elements from JPL SBDB at J2000.0
        (2001, make_body(
            "Vesta", GM_VESTA, R_VESTA, R_MEAN_VESTA, GM_SUN,
            A_VESTA,              // a ≈ 2.362 AU
            0.08862,              // e
            7.134,                // i (deg)
            103.851,              // raan (deg)
            149.855,              // argp (deg)
            267.0,                // nu (deg) — estimated at J2000
        )),
        // 2002: 2 Pallas — third-largest asteroid, high inclination
        // Elements from JPL SBDB at J2000.0
        (2002, make_body(
            "Pallas", GM_PALLAS, R_PALLAS, R_MEAN_PALLAS, GM_SUN,
            A_PALLAS,             // a ≈ 2.772 AU
            0.23080,              // e
            34.832,               // i (deg) — notably high inclination
            173.026,              // raan (deg)
            310.202,              // argp (deg)
            58.0,                 // nu (deg) — estimated at J2000
        )),
        // 2003: 10 Hygiea — fourth-largest asteroid, nearly spherical
        // Elements from JPL SBDB at J2000.0
        (2003, make_body(
            "Hygiea", GM_HYGIEA, R_HYGIEA, R_MEAN_HYGIEA, GM_SUN,
            A_HYGIEA,             // a ≈ 3.142 AU
            0.11246,              // e
            3.842,                // i (deg)
            283.204,              // raan (deg)
            312.317,              // argp (deg)
            185.0,                // nu (deg) — estimated at J2000
        )),
    ]
}

/// Notable Kuiper Belt Objects registry (beyond dwarf planets).
///
/// Orbital elements are ecliptic heliocentric J2000 osculating elements from
/// JPL Small-Body Database.
///
/// KBO IDs use a custom scheme starting at 3001.
fn build_kbos() -> Vec<(u32, BodyData)> {
    vec![
        // 3001: 50000 Quaoar — classical KBO with rings
        // Elements from JPL SBDB at J2000.0
        (3001, make_body(
            "Quaoar", GM_QUAOAR, R_QUAOAR, R_MEAN_QUAOAR, GM_SUN,
            A_QUAOAR,             // a ≈ 43.69 AU
            0.03912,              // e
            7.991,                // i (deg)
            188.815,              // raan (deg)
            155.885,              // argp (deg)
            281.0,                // nu (deg) — estimated at J2000
        )),
        // 3002: 90377 Sedna — extreme detached object, a ≈ 507 AU
        // Elements from JPL SBDB at J2000.0
        (3002, make_body(
            "Sedna", GM_SEDNA, R_SEDNA, R_MEAN_SEDNA, GM_SUN,
            A_SEDNA,              // a ≈ 506.8 AU
            0.84076,              // e — highly eccentric
            11.929,               // i (deg)
            144.514,              // raan (deg)
            311.122,              // argp (deg)
            358.0,                // nu (deg) — near aphelion at J2000
        )),
        // 3003: 90482 Orcus — "anti-Pluto" Plutino, 3:2 resonance
        // Elements from JPL SBDB at J2000.0
        (3003, make_body(
            "Orcus", GM_ORCUS, R_ORCUS, R_MEAN_ORCUS, GM_SUN,
            A_ORCUS,              // a ≈ 39.17 AU
            0.22611,              // e
            20.573,               // i (deg)
            268.609,              // raan (deg)
            73.001,               // argp (deg)
            170.0,                // nu (deg) — estimated at J2000
        )),
    ]
}

/// Notable comets registry.
///
/// Orbital elements are ecliptic heliocentric J2000 osculating elements from
/// JPL Small-Body Database (SBDB) and Minor Planet Center.
///
/// Comet IDs use a custom scheme starting at 1001.
///
/// Sources:
/// - JPL SBDB: https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html
/// - Minor Planet Center: https://www.minorplanetcenter.net/
fn build_comets() -> Vec<(u32, BodyData)> {
    vec![
        // 1001: 1P/Halley — famous retrograde comet, ~75 year period
        // Perihelion: 1986-02-09, next: ~2061
        // Elements from JPL SBDB epoch 1994-02-17
        (1001, make_body(
            "Halley", 0.0, 5_500.0, 5_500.0, GM_SUN,
            2.685e12,         // a ≈ 17.94 AU
            0.96714,          // e
            162.26,           // i (deg) — retrograde orbit
            58.42,            // raan (deg)
            111.33,           // argp (deg)
            156.0,            // nu (deg) — estimated at J2000
        )),
        // 1002: C/1995 O1 (Hale-Bopp) — Great Comet of 1997
        // Perihelion: 1997-04-01, period ~2,520 years
        // Elements from JPL SBDB
        (1002, make_body(
            "Hale-Bopp", 0.0, 30_000.0, 30_000.0, GM_SUN,
            2.655e13,         // a ≈ 177.4 AU
            0.99510,          // e
            89.43,            // i (deg) — nearly perpendicular to ecliptic
            282.47,           // raan (deg)
            130.59,           // argp (deg)
            230.0,            // nu (deg) — outbound from perihelion at J2000
        )),
        // 1003: C/2020 F3 (NEOWISE) — Great Comet of 2020
        // Perihelion: 2020-07-03, period ~6,800 years
        // Elements from JPL SBDB
        (1003, make_body(
            "NEOWISE", 0.0, 2_500.0, 2_500.0, GM_SUN,
            5.367e13,         // a ≈ 358.5 AU
            0.99921,          // e
            128.94,           // i (deg) — retrograde
            61.01,            // raan (deg)
            37.28,            // argp (deg)
            40.0,             // nu (deg) — estimated at J2000
        )),
        // 1004: 2P/Encke — shortest-period comet, parent of Taurids
        // Period ~3.3 years
        // Elements from JPL SBDB
        (1004, make_body(
            "Encke", 0.0, 2_400.0, 2_400.0, GM_SUN,
            3.306e11,         // a ≈ 2.21 AU
            0.84700,          // e
            11.77,            // i (deg)
            334.57,           // raan (deg)
            186.57,           // argp (deg)
            45.0,             // nu (deg) — estimated at J2000
        )),
        // 1005: 55P/Tempel-Tuttle — parent of Leonid meteor shower
        // Period ~33.1 years
        // Elements from JPL SBDB
        (1005, make_body(
            "Tempel-Tuttle", 0.0, 1_800.0, 1_800.0, GM_SUN,
            1.545e12,         // a ≈ 10.33 AU
            0.90550,          // e
            162.34,           // i (deg) — retrograde
            235.26,           // raan (deg)
            172.59,           // argp (deg)
            25.0,             // nu (deg) — estimated at J2000
        )),
        // 1006: 109P/Swift-Tuttle — parent of Perseid meteor shower
        // Period ~133 years, nucleus ~26 km diameter
        // Elements from JPL SBDB
        (1006, make_body(
            "Swift-Tuttle", 0.0, 13_000.0, 13_000.0, GM_SUN,
            3.906e12,         // a ≈ 26.1 AU
            0.96300,          // e
            113.45,           // i (deg) — retrograde
            139.38,           // raan (deg)
            152.98,           // argp (deg)
            60.0,             // nu (deg) — estimated at J2000
        )),
    ]
}

use std::sync::LazyLock;

static REGISTRY: LazyLock<Vec<BodyData>> = LazyLock::new(build_registry);
static MOON_DATA: LazyLock<BodyData> = LazyLock::new(build_moon);
static MOON_REGISTRY: LazyLock<Vec<(u32, BodyData)>> = LazyLock::new(build_moons);
static COMET_REGISTRY: LazyLock<Vec<(u32, BodyData)>> = LazyLock::new(build_comets);
static ASTEROID_REGISTRY: LazyLock<Vec<(u32, BodyData)>> = LazyLock::new(build_asteroids);
static KBO_REGISTRY: LazyLock<Vec<(u32, BodyData)>> = LazyLock::new(build_kbos);

/// Look up a body by NAIF-style ID.
///
/// IDs: 0 = Sun, 1–8 = planets, 9 = Pluto, 10 = Ceres, 11 = Eris,
///      12 = Haumea, 13 = Makemake, 301 = Moon,
///      401–402 = Mars moons, 501–504 = Galilean moons,
///      602 = Enceladus, 606 = Titan, 705 = Miranda,
///      801 = Triton, 901 = Charon,
///      1001–1006 = Notable comets,
///      2001–2003 = Notable asteroids (Vesta, Pallas, Hygiea),
///      3001–3003 = Notable KBOs (Quaoar, Sedna, Orcus)
pub fn body_by_id(id: u32) -> Option<&'static BodyData> {
    match id {
        0..=13 => REGISTRY.get(id as usize),
        301 => Some(&*MOON_DATA),
        1001..=1006 => COMET_REGISTRY.iter().find(|(nid, _)| *nid == id).map(|(_, b)| b),
        2001..=2003 => ASTEROID_REGISTRY.iter().find(|(nid, _)| *nid == id).map(|(_, b)| b),
        3001..=3003 => KBO_REGISTRY.iter().find(|(nid, _)| *nid == id).map(|(_, b)| b),
        _ => MOON_REGISTRY.iter().find(|(nid, _)| *nid == id).map(|(_, b)| b),
    }
}

/// Given a moon NAIF ID, return the parent planet NAIF ID.
/// Returns None if the ID is not a known moon.
pub fn moon_parent_id(moon_id: u32) -> Option<u32> {
    match moon_id {
        301 => Some(3),        // Moon → Earth
        401 | 402 => Some(4),  // Phobos, Deimos → Mars
        501..=504 => Some(5),  // Galilean moons → Jupiter
        601..=606 => Some(6),  // Saturn moons → Saturn
        701..=705 => Some(7),  // Uranus moons → Uranus
        801 => Some(8),        // Triton → Neptune
        901 => Some(9),        // Charon → Pluto
        _ => None,
    }
}

/// Return all registered moon NAIF IDs.
pub fn all_moon_ids() -> Vec<u32> {
    let mut ids = vec![301u32];
    ids.extend(MOON_REGISTRY.iter().map(|(id, _)| *id));
    ids
}

/// Return all registered comet NAIF IDs.
pub fn all_comet_ids() -> Vec<u32> {
    COMET_REGISTRY.iter().map(|(id, _)| *id).collect()
}

/// Return all registered notable asteroid NAIF IDs.
pub fn all_asteroid_ids() -> Vec<u32> {
    ASTEROID_REGISTRY.iter().map(|(id, _)| *id).collect()
}

/// Return all registered notable KBO NAIF IDs.
pub fn all_kbo_ids() -> Vec<u32> {
    KBO_REGISTRY.iter().map(|(id, _)| *id).collect()
}

/// Check whether a body ID belongs to a comet.
#[allow(dead_code)]
pub fn is_comet(id: u32) -> bool {
    (1001..=1006).contains(&id)
}
