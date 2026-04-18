//! astro-core — Pure Rust astrodynamics library for WASM compilation
//!
//! Extracted from astrora, this crate provides orbital mechanics, coordinate
//! transforms, ephemeris calculations, geodesics, and satellite operations
//! without any Python (PyO3) dependencies.

pub mod coordinates;
pub mod core;
pub mod ephemeris;
pub mod geodesics;
pub mod maneuvers;
pub mod propagators;
pub mod satellite;
pub mod utils;

pub use core::{PoliastroError, PoliastroResult};
