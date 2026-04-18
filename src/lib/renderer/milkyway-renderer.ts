/**
 * Milky Way visualization renderer.
 *
 * Two complementary views that crossfade based on camera distance:
 *
 * 1. **Band** (background scene): A procedural sphere showing the Milky Way as a
 *    diffuse band across the sky, as seen from within the galaxy near Sol.
 *    Brightness peaks along the galactic equator and toward the galactic center.
 *
 * 2. **Disk** (far scene): A flat disk at the galactic center showing spiral arm
 *    structure, visible when the camera is far enough to see the galaxy as a whole.
 *
 * Crossfade thresholds (camera distance from origin in parsecs):
 *   - < 500 pc: band at full, disk hidden
 *   - 500–2000 pc: band fading out, disk fading in
 *   - > 2000 pc: disk at full, band hidden
 *
 * Coordinates: J2000 equatorial (matching all other renderers).
 *
 * Sources:
 * - Milky Way spiral arm model: Vallée (2008), AJ 135, 1301
 *   4 major arms, pitch angle ~12°, logarithmic spirals
 * - Disk exponential profile: Bland-Hawthorn & Gerhard (2016), ARA&A 54, 529
 */

import {
	SphereGeometry,
	Mesh,
	MeshBasicNodeMaterial,
	SpriteNodeMaterial,
	Sprite,
	BackSide,
	AdditiveBlending
} from 'three/webgpu';
import {
	positionLocal,
	uv,
	vec2,
	vec3,
	float,
	smoothstep,
	Fn,
	mix,
	cos,
	abs,
	uniform
} from 'three/tsl';
import type { Scene } from 'three/webgpu';
import {
	GALACTIC_NORTH_POLE,
	GALACTIC_CENTER_DIR,
	GALACTIC_CENTER_POS,
	DISK_RADIUS_PC
} from './galactic-constants';

export interface MilkyWayRendererOptions {
	/** Distance (pc) where band starts fading out and disk starts fading in. */
	crossfadeNear?: number;
	/** Distance (pc) where band is fully hidden and disk is fully visible. */
	crossfadeFar?: number;
	/** Band sphere brightness multiplier. */
	bandIntensity?: number;
	/** Disk brightness multiplier. */
	diskIntensity?: number;
}

const DEFAULTS: Required<MilkyWayRendererOptions> = {
	crossfadeNear: 500,
	crossfadeFar: 2000,
	bandIntensity: 1.0,
	diskIntensity: 1.0
};

// ── Galactic plane vectors as arrays for TSL uniforms ───────────────

const GNP = GALACTIC_NORTH_POLE;
const GCD = GALACTIC_CENTER_DIR;
// Galactic Y-axis: cross(north pole, center dir)
const galY_x = GNP.y * GCD.z - GNP.z * GCD.y;
const galY_y = GNP.z * GCD.x - GNP.x * GCD.z;
const galY_z = GNP.x * GCD.y - GNP.y * GCD.x;
const galYLen = Math.sqrt(galY_x * galY_x + galY_y * galY_y + galY_z * galY_z);

export class MilkyWayRenderer {
	private bandMesh: Mesh | null = null;
	private bandMaterial: MeshBasicNodeMaterial | null = null;
	private diskSprite: Sprite | null = null;
	private diskMaterial: SpriteNodeMaterial | null = null;
	private bandOpacityUniform: ReturnType<typeof uniform> | null = null;
	private diskOpacityUniform: ReturnType<typeof uniform> | null = null;
	private opts: Required<MilkyWayRendererOptions>;
	private _visible = true;

	constructor(options: MilkyWayRendererOptions = {}) {
		this.opts = { ...DEFAULTS, ...options };

		this.createBand();
		this.createDisk();
	}

	// ── Band (from-within skybox sphere) ──────────────────────────────

	private createBand(): void {
		const geo = new SphereGeometry(5, 64, 32);
		const mat = new MeshBasicNodeMaterial({
			side: BackSide,
			transparent: true,
			depthWrite: false
		});

		// Galactic north pole components for dot product in shader
		const gnpX = float(GNP.x);
		const gnpY = float(GNP.y);
		const gnpZ = float(GNP.z);

		// Galactic center direction for longitude-dependent brightness
		const gcdX = float(GCD.x);
		const gcdY = float(GCD.y);
		const gcdZ = float(GCD.z);

		const bandIntensity = float(this.opts.bandIntensity);
		this.bandOpacityUniform = uniform(1.0);
		const masterOpacity = this.bandOpacityUniform;

		mat.colorNode = /* @__PURE__ */ Fn(() => {
			// Direction from sphere center to fragment (inside of sphere)
			const dir = positionLocal.normalize();
			const dx = dir.x;
			const dy = dir.y;
			const dz = dir.z;

			// Galactic latitude: sin(b) = dot(dir, galactic_north_pole)
			const sinB = dx.mul(gnpX).add(dy.mul(gnpY)).add(dz.mul(gnpZ));
			const galLat = abs(sinB);

			// Brightness profile: Gaussian-like falloff from galactic equator
			// FWHM ~6° → σ ~2.5° → in sin space ~0.044
			// Use wider profile for diffuse glow + narrow core for bright band
			const narrowBand = smoothstep(float(0.12), float(0.0), galLat).mul(0.8);
			const wideBand = smoothstep(float(0.35), float(0.05), galLat).mul(0.3);

			// Longitude-dependent brightness (brighter toward galactic center)
			const cosL = dx.mul(gcdX).add(dy.mul(gcdY)).add(dz.mul(gcdZ));
			const lonFactor = cosL.mul(0.3).add(0.7).clamp(0.4, 1.0);

			const brightness = narrowBand.add(wideBand).mul(lonFactor).mul(bandIntensity);

			// Warm white / pale blue band color
			return vec3(
				brightness.mul(0.85),
				brightness.mul(0.88),
				brightness.mul(1.0)
			);
		})();

		mat.opacityNode = /* @__PURE__ */ Fn(() => {
			const dir = positionLocal.normalize();
			const dx = dir.x;
			const dy = dir.y;
			const dz = dir.z;

			const sinB = dx.mul(float(GNP.x)).add(dy.mul(float(GNP.y))).add(dz.mul(float(GNP.z)));
			const galLat = abs(sinB);

			// Only visible near galactic equator
			const vis = smoothstep(float(0.4), float(0.0), galLat);
			return vis.mul(float(0.25)).mul(masterOpacity);
		})();

		this.bandMaterial = mat;
		this.bandMesh = new Mesh(geo, mat);
		this.bandMesh.renderOrder = -10;
	}

	// ── Disk (from-outside spiral arm view) ───────────────────────────

	private createDisk(): void {
		const mat = new SpriteNodeMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending
		});

		const diskIntensity = float(this.opts.diskIntensity);
		this.diskOpacityUniform = uniform(0.0);
		const masterOpacity = this.diskOpacityUniform;

		// Spiral arm parameters
		const armCount = 4.0;
		const pitchAngle = 12.0 * (Math.PI / 180); // 12° pitch
		const tanPitch = Math.tan(pitchAngle);

		mat.colorNode = /* @__PURE__ */ Fn(() => {
			// UV centered: (0,0) = center, range [-1, 1]
			const centered = uv().sub(vec2(0.5, 0.5)).mul(2.0);
			const r = centered.length();
			const theta = centered.y.atan(centered.x);

			// Logarithmic spiral: compute angular distance to nearest arm
			// spiral angle = (1/tan(pitch)) * ln(r/r0) - offset per arm
			const spiralPhase = r.max(0.001).log().div(float(tanPitch));
			const armAngle = spiralPhase.add(theta).mul(float(armCount / 2.0));

			// Soft arm edges using cos² profile
			const armProfile = cos(armAngle).mul(cos(armAngle));
			// Inter-arm brightness floor
			const armBrightness = armProfile.mul(0.6).add(0.4);

			// Exponential radial falloff (scale length ~ 0.17 of disk radius)
			const radialFalloff = r.mul(-5.8).exp();

			// Soft edge cutoff at disk boundary
			const edgeFade = smoothstep(float(1.0), float(0.85), r);

			// Central bulge: bright core
			const bulge = r.mul(-15.0).exp().mul(1.5);

			const brightness = radialFalloff.mul(armBrightness).add(bulge).mul(edgeFade).mul(diskIntensity);

			// Warm galactic color (yellowish-white core, bluer arms)
			const coreColor = vec3(1.0, 0.92, 0.75);
			const armColor = vec3(0.7, 0.8, 1.0);
			const color = mix(armColor, coreColor, r.mul(-8.0).exp());

			return color.mul(brightness);
		})();

		mat.opacityNode = /* @__PURE__ */ Fn(() => {
			const centered = uv().sub(vec2(0.5, 0.5)).mul(2.0);
			const r = centered.length();

			const radialFalloff = r.mul(-3.0).exp();
			const edgeFade = smoothstep(float(1.0), float(0.8), r);
			return radialFalloff.mul(edgeFade).mul(float(0.5)).mul(masterOpacity);
		})();

		this.diskMaterial = mat;
		this.diskSprite = new Sprite(mat);

		// Position at galactic center
		this.diskSprite.position.copy(GALACTIC_CENTER_POS);

		// Scale to disk diameter in parsecs
		const diskDiameter = DISK_RADIUS_PC * 2;
		this.diskSprite.scale.set(diskDiameter, diskDiameter, 1);

		this.diskSprite.renderOrder = -5;
	}

	/** Add band sphere to the background scene. */
	addBandTo(scene: Scene): void {
		if (this.bandMesh) scene.add(this.bandMesh);
	}

	/** Add disk sprite to the far scene. */
	addDiskTo(scene: Scene): void {
		if (this.diskSprite) scene.add(this.diskSprite);
	}

	/**
	 * Update crossfade between band and disk views based on camera distance.
	 * Call each frame with the far camera's distance from origin in parsecs.
	 */
	update(cameraDistPc: number): void {
		if (!this._visible) return;

		const { crossfadeNear, crossfadeFar } = this.opts;
		const range = crossfadeFar - crossfadeNear;

		if (cameraDistPc < crossfadeNear) {
			if (this.bandOpacityUniform) this.bandOpacityUniform.value = 1.0;
			if (this.diskOpacityUniform) this.diskOpacityUniform.value = 0.0;
		} else if (cameraDistPc > crossfadeFar) {
			if (this.bandOpacityUniform) this.bandOpacityUniform.value = 0.0;
			if (this.diskOpacityUniform) this.diskOpacityUniform.value = 1.0;
		} else {
			const t = (cameraDistPc - crossfadeNear) / range;
			if (this.bandOpacityUniform) this.bandOpacityUniform.value = 1.0 - t;
			if (this.diskOpacityUniform) this.diskOpacityUniform.value = t;
		}
	}

	/** Toggle overall visibility. */
	setVisible(visible: boolean): void {
		this._visible = visible;
		if (this.bandMesh) this.bandMesh.visible = visible;
		if (this.diskSprite) this.diskSprite.visible = visible;
		if (!visible) {
			if (this.bandOpacityUniform) this.bandOpacityUniform.value = 0.0;
			if (this.diskOpacityUniform) this.diskOpacityUniform.value = 0.0;
		}
	}

	get visible(): boolean {
		return this._visible;
	}

	/** Clean up GPU resources. */
	dispose(): void {
		if (this.bandMesh) {
			this.bandMesh.removeFromParent();
			this.bandMesh.geometry.dispose();
		}
		if (this.diskSprite) {
			this.diskSprite.removeFromParent();
		}
		this.bandMaterial?.dispose();
		this.diskMaterial?.dispose();
	}
}
