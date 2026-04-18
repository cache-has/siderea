//! Ephemeris module — high-accuracy planetary and lunar positions.
//!
//! - **VSOP87A**: heliocentric ecliptic rectangular coordinates (X, Y, Z)
//!   referred to J2000.0, in AU. Planets Mercury–Neptune.
//!   Reference: Bretagnon & Francou (1988).
//!
//! - **Meeus Ch.47**: geocentric ecliptic Moon position (~10" accuracy).
//!   Reference: Meeus, "Astronomical Algorithms", 2nd ed. (1998).

pub mod lunar;
mod vsop87;

pub use lunar::{moon_geocentric_ecliptic, moon_position_geocentric, moon_position_heliocentric};
pub use vsop87::{planet_position, planet_position_au, Planet};
