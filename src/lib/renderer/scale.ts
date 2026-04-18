/**
 * Scale-space definitions and coordinate transforms for multi-scale rendering.
 *
 * Three scale levels:
 * - NEAR:  1 unit = 1 AU  (solar system)
 * - FAR:   1 unit = 1 parsec (stellar / galactic)
 * - BACKGROUND: arbitrary units (skybox)
 *
 * Sources:
 * - 1 AU = 1.495978707e11 m  (IAU 2012 exact)
 * - 1 pc = 648000/π AU = 206264.806... AU  (IAU definition)
 * - 1 pc = 3.0856775814913673e16 m
 */

import { Vector3 } from 'three/webgpu';

export enum ScaleSpace {
	/** 1 unit = 1 AU (~1.496e11 m). Solar system objects. */
	NEAR = 'near',
	/** 1 unit = 1 parsec (~3.086e16 m). Stars and deep space. */
	FAR = 'far',
	/** Arbitrary units. Skybox / galactic backdrop. */
	BACKGROUND = 'background'
}

/** 1 parsec in AU (IAU definition: 648000/π). */
export const AU_PER_PARSEC = 206264.80624709636;

/** 1 AU in meters (IAU 2012 exact definition). */
export const METERS_PER_AU = 1.495978707e11;

/** 1 parsec in meters. */
export const METERS_PER_PARSEC = AU_PER_PARSEC * METERS_PER_AU;

/** Convert a position from near-space (AU) to far-space (parsec). */
export function nearToFar(positionAU: Vector3, out?: Vector3): Vector3 {
	const target = out ?? new Vector3();
	return target.copy(positionAU).multiplyScalar(1 / AU_PER_PARSEC);
}

/** Convert a position from far-space (parsec) to near-space (AU). */
export function farToNear(positionPC: Vector3, out?: Vector3): Vector3 {
	const target = out ?? new Vector3();
	return target.copy(positionPC).multiplyScalar(AU_PER_PARSEC);
}

/** Convert a distance in meters to the given scale space's unit. */
export function metersToUnit(meters: number, space: ScaleSpace): number {
	switch (space) {
		case ScaleSpace.NEAR:
			return meters / METERS_PER_AU;
		case ScaleSpace.FAR:
			return meters / METERS_PER_PARSEC;
		case ScaleSpace.BACKGROUND:
			return meters;
	}
}

/** Convert a distance in scale-space units to meters. */
export function unitToMeters(value: number, space: ScaleSpace): number {
	switch (space) {
		case ScaleSpace.NEAR:
			return value * METERS_PER_AU;
		case ScaleSpace.FAR:
			return value * METERS_PER_PARSEC;
		case ScaleSpace.BACKGROUND:
			return value;
	}
}
