/**
 * Galactic coordinate system constants and transforms.
 *
 * All positions in the codebase use J2000 equatorial (ICRS) coordinates.
 * These constants define the galactic plane orientation and key positions
 * in that frame, enabling galactic structure visualization.
 *
 * Coordinate convention (matching star catalog):
 *   x = d * cos(dec) * cos(ra)
 *   y = d * cos(dec) * sin(ra)
 *   z = d * sin(dec)
 *
 * Sources:
 * - Galactic north pole (J2000): RA = 192.85948°, Dec = +27.12825°
 *   (Reid & Brunthaler 2004, IAU 1958 definition refined)
 * - Galactic center (Sgr A*): RA = 266.4168°, Dec = -29.0078°, d = 8178 pc
 *   (GRAVITY Collaboration 2019)
 * - Solar offset above midplane: ~20.8 pc (Bennett & Bovy 2019)
 * - Disk scale length: ~2.6 kpc, scale height: ~300 pc (Bland-Hawthorn & Gerhard 2016)
 * - Visible disk radius: ~15-20 kpc
 */

import { Vector3, Quaternion, Euler } from 'three/webgpu';

// ── Galactic North Pole (J2000 equatorial, unit vector) ─────────────

const GNP_RA_DEG = 192.85948;
const GNP_DEC_DEG = 27.12825;
const GNP_RA = GNP_RA_DEG * (Math.PI / 180);
const GNP_DEC = GNP_DEC_DEG * (Math.PI / 180);

/**
 * Unit vector toward the galactic north pole in J2000 equatorial Cartesian.
 * This is the normal to the galactic plane.
 */
export const GALACTIC_NORTH_POLE = Object.freeze(
	new Vector3(
		Math.cos(GNP_DEC) * Math.cos(GNP_RA),   // -0.8676
		Math.cos(GNP_DEC) * Math.sin(GNP_RA),   // -0.1981
		Math.sin(GNP_DEC)                         //  0.4560
	).normalize()
);

// ── Galactic Center Direction ───────────────────────────────────────

const GC_RA_DEG = 266.4168;
const GC_DEC_DEG = -29.0078;
const GC_RA = GC_RA_DEG * (Math.PI / 180);
const GC_DEC = GC_DEC_DEG * (Math.PI / 180);

/** Unit vector toward the galactic center in J2000 equatorial Cartesian. */
export const GALACTIC_CENTER_DIR = Object.freeze(
	new Vector3(
		Math.cos(GC_DEC) * Math.cos(GC_RA),
		Math.cos(GC_DEC) * Math.sin(GC_RA),
		Math.sin(GC_DEC)
	).normalize()
);

// ── Galactic Center Position ────────────────────────────────────────

/** Distance to galactic center in parsecs. */
export const GALACTIC_CENTER_DIST_PC = 8178;

/** Position of the galactic center (Sgr A*) in parsecs, J2000 equatorial. */
export const GALACTIC_CENTER_POS = Object.freeze(
	new Vector3().copy(GALACTIC_CENTER_DIR).multiplyScalar(GALACTIC_CENTER_DIST_PC)
);

// ── Galactic Disk Dimensions (parsecs) ──────────────────────────────

/** Visible radius of the Milky Way disk in parsecs (~15 kpc). */
export const DISK_RADIUS_PC = 15000;

/** Disk exponential scale length in parsecs (~2.6 kpc). */
export const DISK_SCALE_LENGTH_PC = 2600;

/** Disk scale height in parsecs (~300 pc). */
export const DISK_SCALE_HEIGHT_PC = 300;

/** Sol's offset above the galactic midplane in parsecs (~20.8 pc). */
export const SOL_Z_OFFSET_PC = 20.8;

// ── Galactic Plane Orientation (as Three.js quaternion) ─────────────

/**
 * Compute the quaternion that rotates the XY plane (normal = +Z)
 * to align with the galactic plane (normal = galactic north pole).
 *
 * This is used to orient disk/grid geometry to the galactic plane.
 */
function computeGalacticPlaneQuaternion(): Quaternion {
	const q = new Quaternion();
	// Rotate from +Z to galactic north pole direction
	q.setFromUnitVectors(new Vector3(0, 0, 1), GALACTIC_NORTH_POLE.clone());
	return q;
}

/** Quaternion rotating the XY plane to the galactic plane orientation. */
export const GALACTIC_PLANE_QUATERNION = Object.freeze(computeGalacticPlaneQuaternion());

// ── Ecliptic North Pole (J2000 equatorial, unit vector) ────────────

/**
 * Unit vector toward the ecliptic north pole in J2000 equatorial Cartesian.
 * The ecliptic pole is at RA = 270°, Dec = 66.5607° (obliquity ≈ 23.4393°).
 * Source: IAU 2006 obliquity of the ecliptic.
 */
const ECL_RA = 270 * (Math.PI / 180);
const ECL_DEC = 66.5607 * (Math.PI / 180);

export const ECLIPTIC_NORTH_POLE = Object.freeze(
	new Vector3(
		Math.cos(ECL_DEC) * Math.cos(ECL_RA),
		Math.cos(ECL_DEC) * Math.sin(ECL_RA),
		Math.sin(ECL_DEC)
	).normalize()
);

// ── Coordinate Transform Helpers ────────────────────────────────────

/**
 * Compute the galactic latitude of a direction vector.
 * Returns angle in radians from the galactic plane (-π/2 to +π/2).
 *
 * @param direction Unit vector in J2000 equatorial Cartesian
 */
export function galacticLatitude(direction: Vector3): number {
	return Math.asin(direction.dot(GALACTIC_NORTH_POLE));
}

/**
 * Compute the galactic longitude of a direction vector.
 * Returns angle in radians (0 to 2π), measured from galactic center direction.
 *
 * @param direction Unit vector in J2000 equatorial Cartesian
 */
export function galacticLongitude(direction: Vector3): number {
	// Project direction onto galactic plane
	const projected = direction.clone().addScaledVector(
		GALACTIC_NORTH_POLE,
		-direction.dot(GALACTIC_NORTH_POLE)
	).normalize();

	// Compute the "galactic Y" axis (north pole × center direction)
	const galY = new Vector3().crossVectors(GALACTIC_NORTH_POLE, GALACTIC_CENTER_DIR).normalize();

	const x = projected.dot(GALACTIC_CENTER_DIR);
	const y = projected.dot(galY);
	return Math.atan2(y, x);
}

// ── Ecliptic Coordinate Helpers ─────────────────────────────────────

/**
 * Compute the ecliptic latitude of a direction vector.
 * Returns angle in radians from the ecliptic plane (-π/2 to +π/2).
 *
 * @param direction Unit vector in J2000 equatorial Cartesian
 */
export function eclipticLatitude(direction: Vector3): number {
	return Math.asin(Math.max(-1, Math.min(1, direction.dot(ECLIPTIC_NORTH_POLE))));
}

/**
 * Compute the ecliptic longitude of a direction vector.
 * Returns angle in radians (0 to 2π), measured from the vernal equinox direction.
 *
 * The vernal equinox in J2000 equatorial is along +X (RA = 0, Dec = 0).
 * We project onto the ecliptic plane and measure from there.
 *
 * @param direction Unit vector in J2000 equatorial Cartesian
 */
export function eclipticLongitude(direction: Vector3): number {
	// Project direction onto ecliptic plane
	const projected = direction.clone().addScaledVector(
		ECLIPTIC_NORTH_POLE,
		-direction.dot(ECLIPTIC_NORTH_POLE)
	);
	const len = projected.length();
	if (len < 1e-10) return 0;
	projected.normalize();

	// Ecliptic X axis = vernal equinox direction (+X in J2000 equatorial)
	const eclX = new Vector3(1, 0, 0);
	// Ecliptic Y axis = ecliptic north × ecliptic X (right-hand rule in ecliptic plane)
	const eclY = new Vector3().crossVectors(ECLIPTIC_NORTH_POLE, eclX).normalize();

	const x = projected.dot(eclX);
	const y = projected.dot(eclY);
	let lon = Math.atan2(y, x);
	if (lon < 0) lon += 2 * Math.PI;
	// Normalize exact 2π to 0
	if (lon >= 2 * Math.PI - 1e-10) lon = 0;
	return lon;
}

// ── Parsecs ↔ Light-years ───────────────────────────────────────────

/** 1 parsec in light-years. */
export const LY_PER_PARSEC = 3.26156;

/** Convert parsecs to light-years. */
export function pcToLy(pc: number): number {
	return pc * LY_PER_PARSEC;
}

/** Convert light-years to parsecs. */
export function lyToPc(ly: number): number {
	return ly / LY_PER_PARSEC;
}
