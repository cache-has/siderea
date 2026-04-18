/**
 * Nebula renderer for the far (stellar) scene.
 *
 * Renders nebulae from the notable object catalog as camera-facing billboard sprites with:
 * - Physical size derived from angular extent at catalog distance
 * - Color tinting based on nebula subtype (emission, reflection, planetary, dark, SNR)
 * - Soft radial falloff with subtle glow
 * - Additive blending for self-luminous types, normal blending for dark nebulae
 *
 * Coordinates: far-scene space, 1 unit = 1 parsec (J2000 equatorial).
 *
 * Size calculation:
 *   physical_size_pc = dist_pc × angular_size_rad
 *   angular_size_rad = angular_size_arcmin × π / 10800
 *
 * A minimum visual size is enforced so small/distant nebulae remain visible.
 */

import {
	Sprite,
	SpriteNodeMaterial,
	AdditiveBlending,
	NormalBlending,
	Group
} from 'three/webgpu';
import {
	vec2,
	vec3,
	float,
	smoothstep,
	uv,
	Fn,
	mix
} from 'three/tsl';
import type { Scene } from 'three/webgpu';
import type { NebulaNO, NotableObject, NebulaSubtype } from '$lib/data/types';

export interface NebulaRendererOptions {
	/**
	 * Minimum visual radius in parsecs (prevents sub-pixel nebulae).
	 * @default 2.0
	 */
	minVisualRadius?: number;

	/**
	 * Scale multiplier applied to the physical size for visibility.
	 * @default 1.5
	 */
	sizeScale?: number;
}

const DEFAULTS: Required<NebulaRendererOptions> = {
	minVisualRadius: 2.0,
	sizeScale: 1.5
};

/**
 * Color palette by nebula subtype.
 *
 * These are stylized representations — real nebulae show complex
 * multi-band emission. Colors chosen for visual distinction.
 *
 * Sources: typical narrowband imaging (Hα = red/pink, OIII = teal, reflection = blue).
 */
const NEBULA_COLORS: Record<NebulaSubtype, { core: [number, number, number]; edge: [number, number, number]; intensity: number }> = {
	emission:          { core: [1.0, 0.4, 0.5],  edge: [0.8, 0.15, 0.2],  intensity: 1.8 },
	reflection:        { core: [0.4, 0.55, 1.0], edge: [0.2, 0.3, 0.8],   intensity: 1.2 },
	planetary:         { core: [0.3, 0.9, 0.8],  edge: [0.15, 0.4, 0.7],  intensity: 2.0 },
	dark:              { core: [0.15, 0.1, 0.08], edge: [0.08, 0.05, 0.03], intensity: 0.3 },
	supernova_remnant: { core: [0.5, 0.7, 1.0],  edge: [0.3, 0.2, 0.8],   intensity: 1.5 }
};

interface NebulaVisual {
	data: NebulaNO;
	sprite: Sprite;
}

/**
 * Convert angular size in arcminutes to physical size in parsecs.
 *
 * For small angles: size_pc ≈ dist_pc × θ_rad
 * where θ_rad = arcmin × π / 10800
 */
export function angularToPhysicalPc(angularSizeArcmin: number, distancePc: number): number {
	const angularSizeRad = angularSizeArcmin * (Math.PI / 10800);
	return distancePc * angularSizeRad;
}

/**
 * Renders nebulae in the far scene as billboard sprites.
 */
export class NebulaRenderer {
	private nebulae: NebulaVisual[] = [];
	private materials: SpriteNodeMaterial[] = [];

	constructor(objects: NotableObject[], options: NebulaRendererOptions = {}) {
		const opts = { ...DEFAULTS, ...options };
		const nebs = objects.filter((o): o is NebulaNO => o.type === 'nebula');

		for (const neb of nebs) {
			const palette = NEBULA_COLORS[neb.subtype] ?? NEBULA_COLORS.emission;
			const isDark = neb.subtype === 'dark';

			const mat = new SpriteNodeMaterial({
				transparent: true,
				depthWrite: false,
				blending: isDark ? NormalBlending : AdditiveBlending
			});

			const [cr, cg, cb] = palette.core;
			const [er, eg, eb] = palette.edge;
			const intensity = palette.intensity;

			mat.colorNode = /* @__PURE__ */ Fn(() => {
				const center = vec2(0.5, 0.5);
				const dist = uv().sub(center).length().mul(2.0);

				const coreColor = vec3(cr, cg, cb);
				const edgeColor = vec3(er, eg, eb);
				const color = mix(coreColor, edgeColor, smoothstep(float(0.0), float(0.8), dist));

				return color.mul(float(intensity));
			})();

			mat.opacityNode = /* @__PURE__ */ Fn(() => {
				const center = vec2(0.5, 0.5);
				const dist = uv().sub(center).length().mul(2.0);

				// Soft circular body
				const body = smoothstep(float(1.0), float(0.3), dist);
				// Outer glow halo (not for dark nebulae)
				const glow = isDark
					? float(0.0)
					: smoothstep(float(1.0), float(0.5), dist).mul(0.15);

				const baseOpacity = isDark ? 0.6 : 0.35;
				return body.mul(float(baseOpacity)).add(glow);
			})();

			this.materials.push(mat);

			const sprite = new Sprite(mat);
			sprite.position.set(neb.x, neb.y, neb.z);

			// Physical size from angular extent, with minimum enforced
			const physicalDiameter = angularToPhysicalPc(neb.angular_size_arcmin, neb.dist_pc);
			const visualRadius = Math.max(opts.minVisualRadius, (physicalDiameter / 2) * opts.sizeScale);
			sprite.scale.setScalar(visualRadius * 2);

			sprite.renderOrder = isDark ? -2 : -1;

			this.nebulae.push({ data: neb, sprite });
		}
	}

	/** Get the data for all rendered nebulae. */
	get items(): NebulaNO[] {
		return this.nebulae.map((n) => n.data);
	}

	/** Get the sprite for a specific nebula by ID. */
	getSprite(id: string): Sprite | undefined {
		return this.nebulae.find((n) => n.data.id === id)?.sprite;
	}

	/** Add all nebula sprites to a scene. */
	addTo(scene: Scene): void {
		for (const n of this.nebulae) {
			scene.add(n.sprite);
		}
	}

	/** Remove all nebula sprites from a scene. */
	removeFrom(scene: Scene): void {
		for (const n of this.nebulae) {
			scene.remove(n.sprite);
		}
	}

	/** Clean up GPU resources. */
	dispose(): void {
		for (const n of this.nebulae) {
			n.sprite.removeFromParent();
		}
		for (const m of this.materials) m.dispose();
		this.nebulae.length = 0;
	}
}
