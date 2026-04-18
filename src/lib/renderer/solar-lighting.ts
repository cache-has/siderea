/**
 * Solar system lighting for the near scene.
 *
 * Places a PointLight at the origin (Sun's heliocentric position) with
 * physically correct inverse-square falloff (decay=2). An AmbientLight
 * provides minimal fill so objects on the night side remain barely visible
 * without washing out the darkness of space.
 *
 * Intensity is tuned for the near scene where 1 unit = 1 AU:
 * - At Earth (1 AU): full illumination
 * - At Jupiter (~5.2 AU): ~1/27th intensity
 * - At Neptune (~30 AU): ~1/900th intensity
 */

import { PointLight, AmbientLight, type Scene } from 'three/webgpu';

export interface SolarLightingOptions {
	/** Sun point light intensity in candelas. Default: 2. */
	sunIntensity?: number;
	/** Sun light color as hex. Default: 0xfff5e6 (warm white, ~5778K). */
	sunColor?: number;
	/** Ambient light intensity. Default: 0.03. */
	ambientIntensity?: number;
	/** Ambient light color as hex. Default: 0x1a1a2e (very subtle blue-gray). */
	ambientColor?: number;
}

const DEFAULTS: Required<SolarLightingOptions> = {
	sunIntensity: 2,
	sunColor: 0xfff5e6,
	ambientIntensity: 0.03,
	ambientColor: 0x1a1a2e
};

export class SolarSystemLighting {
	readonly sunLight: PointLight;
	readonly ambientLight: AmbientLight;

	constructor(options: SolarLightingOptions = {}) {
		const opts = { ...DEFAULTS, ...options };

		// Sun at heliocentric origin — inverse-square falloff, infinite range
		this.sunLight = new PointLight(opts.sunColor, opts.sunIntensity);
		this.sunLight.decay = 2;
		this.sunLight.distance = 0;
		this.sunLight.position.set(0, 0, 0);

		// Subtle ambient fill — prevents total blackout on night sides
		this.ambientLight = new AmbientLight(opts.ambientColor, opts.ambientIntensity);
	}

	/** Add both lights to a scene. */
	addTo(scene: Scene): void {
		scene.add(this.sunLight);
		scene.add(this.ambientLight);
	}

	/** Remove both lights from their parent scene. */
	removeFrom(scene: Scene): void {
		scene.remove(this.sunLight);
		scene.remove(this.ambientLight);
	}

	/** Clean up light resources. */
	dispose(): void {
		this.sunLight.dispose();
		this.ambientLight.dispose();
	}

	get sunIntensity(): number {
		return this.sunLight.intensity;
	}
	set sunIntensity(v: number) {
		this.sunLight.intensity = v;
	}

	get ambientIntensity(): number {
		return this.ambientLight.intensity;
	}
	set ambientIntensity(v: number) {
		this.ambientLight.intensity = v;
	}
}
