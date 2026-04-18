/**
 * Atmospheric rim-lighting renderer for planets with atmospheres.
 *
 * Adds a thin transparent shell mesh around each planet that has an atmosphere.
 * Uses a Fresnel (view-angle-dependent) effect: transparent when viewed head-on,
 * glowing at the limb (edges). This produces a subtle atmospheric halo that
 * enhances the 3D appearance of planets.
 *
 * The shell is a child of the planet mesh, so it inherits position and axial tilt.
 *
 * Atmosphere colors are chosen per-planet based on atmospheric composition:
 * - Venus: thick pale yellow-white haze
 * - Earth: thin blue atmospheric scattering
 * - Mars: very thin dusty orange haze
 * - Jupiter: warm amber glow
 * - Saturn: pale gold
 * - Uranus: cyan
 * - Neptune: deep blue
 * - Pluto: extremely thin, barely visible gray-blue
 *
 * Coordinates: near-scene space, 1 unit = 1 AU.
 */

import {
	SphereGeometry,
	Mesh,
	MeshStandardNodeMaterial,
	BackSide,
	AdditiveBlending
} from 'three/webgpu';
import {
	vec3,
	float,
	normalView,
	positionViewDirection,
	pow,
	Fn
} from 'three/tsl';
import { METERS_PER_AU } from './scale';
import type { SolarSystemBody } from '$lib/data/types';

/** Atmosphere visual parameters per NAIF ID. */
interface AtmosphereStyle {
	/** RGB color [0-1]. */
	color: [number, number, number];
	/** Relative shell thickness above planet surface (1.05 = 5% larger). */
	shellScale: number;
	/** Fresnel exponent — higher = thinner rim glow. */
	fresnelPower: number;
	/** Base intensity of the rim glow. */
	intensity: number;
}

/** Per-planet atmosphere visual styles. */
const ATMOSPHERE_STYLES: Record<number, AtmosphereStyle> = {
	// Venus: thick CO2 atmosphere, pale yellow-white scattering
	2: { color: [0.95, 0.88, 0.7], shellScale: 1.08, fresnelPower: 2.0, intensity: 0.6 },
	// Earth: N2/O2 Rayleigh scattering — blue
	3: { color: [0.4, 0.65, 1.0], shellScale: 1.04, fresnelPower: 3.0, intensity: 0.5 },
	// Mars: thin CO2, dusty reddish haze
	4: { color: [0.85, 0.55, 0.35], shellScale: 1.02, fresnelPower: 4.0, intensity: 0.25 },
	// Jupiter: thick H2/He, warm amber
	5: { color: [0.9, 0.75, 0.5], shellScale: 1.03, fresnelPower: 2.5, intensity: 0.35 },
	// Saturn: H2/He, pale gold
	6: { color: [0.92, 0.85, 0.65], shellScale: 1.03, fresnelPower: 2.5, intensity: 0.3 },
	// Uranus: H2/He/CH4, cyan-blue
	7: { color: [0.5, 0.8, 0.9], shellScale: 1.03, fresnelPower: 2.5, intensity: 0.3 },
	// Neptune: H2/He/CH4, deep blue
	8: { color: [0.3, 0.45, 0.9], shellScale: 1.03, fresnelPower: 2.5, intensity: 0.35 },
	// Pluto: extremely thin N2/CH4 atmosphere
	9: { color: [0.6, 0.65, 0.75], shellScale: 1.01, fresnelPower: 5.0, intensity: 0.1 }
};

export interface AtmosphereRendererOptions {
	/**
	 * Size exaggeration factor (must match planet renderer).
	 * @default 200
	 */
	sizeExaggeration?: number;
}

/** Runtime state for a single atmosphere shell. */
interface AtmosphereState {
	naifId: number;
	mesh: Mesh;
	geometry: SphereGeometry;
	material: MeshStandardNodeMaterial;
	/** Planet radius in km (for rebuilding on exaggeration change). */
	radiusKm: number;
	/** Shell scale factor. */
	shellScale: number;
}

/**
 * Create a Fresnel rim-lighting material for an atmospheric shell.
 *
 * The effect uses the dot product between the view direction and the surface
 * normal: at the limb (edges), the dot product approaches 0, producing maximum
 * glow. At the center (head-on), the surface is transparent.
 */
function createAtmosphereMaterial(style: AtmosphereStyle): MeshStandardNodeMaterial {
	const material = new MeshStandardNodeMaterial({
		transparent: true,
		depthWrite: false,
		side: BackSide,
		blending: AdditiveBlending,
		roughness: 1.0,
		metalness: 0.0
	});

	const [r, g, b] = style.color;
	const fresnelPow = style.fresnelPower;
	const intensity = style.intensity;

	material.colorNode = vec3(r, g, b);

	material.opacityNode = Fn(() => {
		// Fresnel: dot(viewDir, normal) → 1 at center, 0 at edge
		// Since we render BackSide, the normal points inward; negate it
		const normal = normalView.negate();
		const viewDir = positionViewDirection.normalize();
		const dotNV = normal.dot(viewDir).clamp(0.0, 1.0);

		// Invert: 0 at center → 1 at edge, then power for sharpness
		const rim = float(1.0).sub(dotNV);
		const fresnel = pow(rim, float(fresnelPow));

		return fresnel.mul(intensity);
	})();

	return material;
}

/**
 * Manages atmospheric rim-lighting shells for planets with atmospheres.
 *
 * Atmosphere meshes are created as children of the planet mesh, so they
 * automatically follow position and axial tilt.
 *
 * Usage:
 * ```ts
 * const atmo = new AtmosphereRenderer(planets, { sizeExaggeration: 200 });
 * atmo.attachTo((naifId) => planetRenderer.getMesh(naifId));
 * // Atmospheres render automatically via parent mesh transforms.
 * ```
 */
export class AtmosphereRenderer {
	private atmospheres: AtmosphereState[] = [];
	private sizeExaggeration: number;

	constructor(bodies: SolarSystemBody[], options: AtmosphereRendererOptions = {}) {
		this.sizeExaggeration = options.sizeExaggeration ?? 200;

		for (const body of bodies) {
			// Only create atmospheres for bodies with atmosphere data and a known style
			if (!body.atmosphere) continue;
			const style = ATMOSPHERE_STYLES[body.naif_id];
			if (!style) continue;

			this.createAtmosphere(body, style);
		}
	}

	private createAtmosphere(body: SolarSystemBody, style: AtmosphereStyle): void {
		const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * this.sizeExaggeration;
		const shellRadius = radiusAU * style.shellScale;

		const segments = body.naif_id >= 5 ? 48 : 32;
		const geometry = new SphereGeometry(shellRadius, segments, segments);
		const material = createAtmosphereMaterial(style);
		const mesh = new Mesh(geometry, material);

		this.atmospheres.push({
			naifId: body.naif_id,
			mesh,
			geometry,
			material,
			radiusKm: body.radius_km,
			shellScale: style.shellScale
		});
	}

	/**
	 * Attach atmosphere shells to their parent planet meshes.
	 *
	 * @param getMesh Function to retrieve a planet mesh by NAIF ID
	 */
	attachTo(getMesh: (naifId: number) => Mesh | undefined): void {
		for (const atmo of this.atmospheres) {
			const parentMesh = getMesh(atmo.naifId);
			if (parentMesh) {
				parentMesh.add(atmo.mesh);
			}
		}
	}

	/** Detach all atmosphere shells from their parents. */
	detach(): void {
		for (const atmo of this.atmospheres) {
			atmo.mesh.removeFromParent();
		}
	}

	/**
	 * Update atmosphere shell scale when planet size exaggeration changes.
	 * Must be called whenever PlanetRenderer.setSizeExaggeration() is called.
	 */
	setSizeExaggeration(factor: number): void {
		this.sizeExaggeration = factor;
		for (const atmo of this.atmospheres) {
			const radiusAU = (atmo.radiusKm / (METERS_PER_AU / 1000)) * factor;
			const shellRadius = radiusAU * atmo.shellScale;

			const segments = atmo.naifId >= 5 ? 48 : 32;
			atmo.geometry.dispose();
			atmo.geometry = new SphereGeometry(shellRadius, segments, segments);
			atmo.mesh.geometry = atmo.geometry;
		}
	}

	/** Get the list of NAIF IDs that have atmosphere shells. */
	get naifIds(): number[] {
		return this.atmospheres.map((a) => a.naifId);
	}

	/** Clean up all GPU resources. */
	dispose(): void {
		for (const atmo of this.atmospheres) {
			atmo.mesh.removeFromParent();
			atmo.geometry.dispose();
			atmo.material.dispose();
		}
		this.atmospheres.length = 0;
	}
}
