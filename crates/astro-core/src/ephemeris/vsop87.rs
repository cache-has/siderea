//! VSOP87A wrapper — planet positions in heliocentric ecliptic J2000 coordinates.

use crate::core::constants::AU;
use vsop87::vsop87a;

/// Planets supported by VSOP87.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Planet {
    Mercury,
    Venus,
    Earth,
    Mars,
    Jupiter,
    Saturn,
    Uranus,
    Neptune,
}

impl Planet {
    /// Convert a NAIF-style body ID (1–8) to a Planet.
    pub fn from_body_id(id: u32) -> Option<Self> {
        match id {
            1 => Some(Self::Mercury),
            2 => Some(Self::Venus),
            3 => Some(Self::Earth),
            4 => Some(Self::Mars),
            5 => Some(Self::Jupiter),
            6 => Some(Self::Saturn),
            7 => Some(Self::Uranus),
            8 => Some(Self::Neptune),
            _ => None,
        }
    }
}

/// Compute heliocentric ecliptic J2000 position in **AU**.
///
/// `jde` is the Julian Ephemeris Day (e.g. 2451545.0 for J2000.0).
///
/// Returns `(x, y, z)` in astronomical units.
pub fn planet_position_au(planet: Planet, jde: f64) -> (f64, f64, f64) {
    let coords = match planet {
        Planet::Mercury => vsop87a::mercury(jde),
        Planet::Venus => vsop87a::venus(jde),
        Planet::Earth => vsop87a::earth(jde),
        Planet::Mars => vsop87a::mars(jde),
        Planet::Jupiter => vsop87a::jupiter(jde),
        Planet::Saturn => vsop87a::saturn(jde),
        Planet::Uranus => vsop87a::uranus(jde),
        Planet::Neptune => vsop87a::neptune(jde),
    };
    (coords.x, coords.y, coords.z)
}

/// Compute heliocentric ecliptic J2000 position in **meters**.
///
/// `jde` is the Julian Ephemeris Day.
///
/// Returns `(x, y, z)` in meters.
pub fn planet_position(planet: Planet, jde: f64) -> (f64, f64, f64) {
    let (x, y, z) = planet_position_au(planet, jde);
    (x * AU, y * AU, z * AU)
}
