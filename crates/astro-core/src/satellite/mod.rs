//! Satellite operations — SGP4/SDP4 propagation and TLE/OMM parsing

pub mod omm;
pub mod sgp4_wrapper;
pub mod tle;

pub use omm::parse_omm;
pub use sgp4_wrapper::{propagate_batch, propagate_from_elements, SatelliteState, Sgp4Error};
pub use tle::parse_tle;
