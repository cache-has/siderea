/**
 * Star cluster renderer for the far (stellar) scene.
 *
 * Renders star clusters from the notable object catalog as camera-facing billboard sprites:
 * - **Open clusters**: Loose, irregular appearance with warm golden tones
 * - **Globular clusters**: Tight, spherical with bright core and steep falloff
 *
 * Physical size derived from angular extent at catalog distance (same as nebula renderer).
 * Coordinates: far-scene space, 1 unit = 1 parsec (J2000 equatorial).
 */

import {
	Sprite,
	SpriteNodeMaterial,
	AdditiveBlending,
	Color
} from 'three/webgpu';
import {
	vec2,
	vec3,
	float,
	smoothstep,
	uv,
	Fn,
	mix,
	pow
} from 'three/tsl';
import type { Scene } from 'three/webgpu';
import type { ClusterNO, ClusterSubtype, NotableObject } from '$lib/data/types';

export interface ClusterRendererOptions {
	/**
	 * Minimum visual radius in parsecs (prevents sub-pixel clusters).
	 * @default 3.0
	 */
	minVisualRadius?: number;

	/**
	 * Scale multiplier applied to the physical size for visibility.
	 * @default 1.2
	 */
	sizeScale?: number;
}

const DEFAULTS: Required<ClusterRendererOptions> = {
	minVisualRadius: 3.0,
	sizeScale: 1.2
};

/**
 * Visual palette by cluster subtype.
 *
 * Open clusters: warm stellar colors (young populations, OB associations)
 * Globular clusters: cool ancient populations (metal-poor, evolved stars)
 */
const CLUSTER_COLORS: Record<ClusterSubtype, {
	core: [number, number, number];
	edge: [number, number, number];
	intensity: number;
	coreConcentration: number;
}> = {
	open: {
		core: [1.0, 0.9, 0.7],
		edge: [0.8, 0.6, 0.35],
		intensity: 1.4,
		coreConcentration: 0.5   // loose — gradual falloff
	},
	globular: {
		core: [1.0, 0.95, 0.85],
		edge: [0.6, 0.55, 0.7],
		intensity: 1.8,
		coreConcentration: 0.25  // tight — steep core
	}
};

interface ClusterVisual {
	data: ClusterNO;
	sprite: Sprite;
}

/**
 * Convert angular size in arcminutes to physical size in parsecs.
 */
function angularToPhysicalPc(angularSizeArcmin: number, distancePc: number): number {
	const angularSizeRad = angularSizeArcmin * (Math.PI / 10800);
	return distancePc * angularSizeRad;
}

/**
 * Renders star clusters in the far scene as billboard sprites.
 */
export class ClusterRenderer {
	private clusters: ClusterVisual[] = [];
	private materials: SpriteNodeMaterial[] = [];

	constructor(objects: NotableObject[], options: ClusterRendererOptions = {}) {
		const opts = { ...DEFAULTS, ...options };
		const clusterObjects = objects.filter((o): o is ClusterNO => o.type === 'cluster');

		for (const cluster of clusterObjects) {
			const palette = CLUSTER_COLORS[cluster.subtype] ?? CLUSTER_COLORS.open;

			const mat = new SpriteNodeMaterial({
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending
			});

			const [cr, cg, cb] = palette.core;
			const [er, eg, eb] = palette.edge;
			const intensity = palette.intensity;
			const concentration = palette.coreConcentration;
			const isGlobular = cluster.subtype === 'globular';

			mat.colorNode = /* @__PURE__ */ Fn(() => {
				const center = vec2(0.5, 0.5);
				const dist = uv().sub(center).length().mul(2.0);

				const coreColor = vec3(cr, cg, cb);
				const edgeColor = vec3(er, eg, eb);

				// Globular: steep power-curve core → edge transition
				// Open: gentle linear blend
				const t = isGlobular
					? pow(smoothstep(float(0.0), float(0.9), dist), float(0.6))
					: smoothstep(float(0.0), float(0.8), dist);

				const color = mix(coreColor, edgeColor, t);
				return color.mul(float(intensity));
			})();

			mat.opacityNode = /* @__PURE__ */ Fn(() => {
				const center = vec2(0.5, 0.5);
				const dist = uv().sub(center).length().mul(2.0);

				// Core body — concentration controls how tight the bright center is
				const body = smoothstep(float(1.0), float(concentration), dist);

				// Subtle outer halo
				const halo = smoothstep(float(1.0), float(0.6), dist).mul(0.1);

				const baseOpacity = isGlobular ? 0.45 : 0.3;
				return body.mul(float(baseOpacity)).add(halo);
			})();

			this.materials.push(mat);

			const sprite = new Sprite(mat);
			sprite.position.set(cluster.x, cluster.y, cluster.z);

			// Physical size from angular extent, with minimum enforced
			const physicalDiameter = angularToPhysicalPc(cluster.angular_size_arcmin, cluster.dist_pc);
			const visualRadius = Math.max(opts.minVisualRadius, (physicalDiameter / 2) * opts.sizeScale);
			sprite.scale.setScalar(visualRadius * 2);

			sprite.renderOrder = -1;

			this.clusters.push({ data: cluster, sprite });
		}
	}

	/** Get the data for all rendered clusters. */
	get items(): ClusterNO[] {
		return this.clusters.map((c) => c.data);
	}

	/** Get the sprite for a specific cluster by ID. */
	getSprite(id: string): Sprite | undefined {
		return this.clusters.find((c) => c.data.id === id)?.sprite;
	}

	/** Add all cluster sprites to a scene. */
	addTo(scene: Scene): void {
		for (const c of this.clusters) {
			scene.add(c.sprite);
		}
	}

	/** Remove all cluster sprites from a scene. */
	removeFrom(scene: Scene): void {
		for (const c of this.clusters) {
			scene.remove(c.sprite);
		}
	}

	/** Clean up GPU resources. */
	dispose(): void {
		for (const c of this.clusters) {
			c.sprite.removeFromParent();
		}
		for (const m of this.materials) m.dispose();
		this.clusters.length = 0;
	}
}
