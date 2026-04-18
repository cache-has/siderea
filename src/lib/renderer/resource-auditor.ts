/**
 * GPU resource auditing for Siderea scenes.
 *
 * Traverses Three.js scene graphs to count and estimate memory usage
 * for geometries, materials, and textures. Provides both a quick summary
 * (for the perf overlay) and a detailed breakdown (for console logging).
 *
 * Memory estimates are approximate — actual GPU memory depends on driver
 * internals, mipmap generation, and compression formats.
 */

import type { Object3D, BufferGeometry, Material, Texture, Scene } from 'three/webgpu';

/** Per-object resource snapshot. */
interface ObjectEntry {
	name: string;
	type: string;
	geometryVertices: number;
	geometryBytes: number;
	textureCount: number;
	textureBytes: number;
}

/** Per-scene layer summary. */
export interface LayerReport {
	name: string;
	objects: number;
	geometries: number;
	materials: number;
	textures: number;
	estimatedGeometryBytes: number;
	estimatedTextureBytes: number;
	details: ObjectEntry[];
}

/** Full audit report across all scene layers. */
export interface ResourceAuditReport {
	layers: LayerReport[];
	totals: {
		objects: number;
		geometries: number;
		materials: number;
		textures: number;
		estimatedGeometryBytes: number;
		estimatedTextureBytes: number;
		estimatedTotalBytes: number;
	};
}

/** Estimate byte size of a BufferGeometry from its attributes. */
function estimateGeometryBytes(geometry: BufferGeometry): number {
	let bytes = 0;
	for (const name in geometry.attributes) {
		const attr = geometry.attributes[name];
		if (attr && 'array' in attr) {
			bytes += (attr.array as ArrayLike<number>).length * ((attr.array as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 4);
		}
	}
	if (geometry.index && 'array' in geometry.index) {
		bytes += (geometry.index.array as ArrayLike<number>).length * ((geometry.index.array as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 2);
	}
	return bytes;
}

/** Estimate byte size of a Texture (width × height × 4 bytes RGBA, ×1.33 for mipmaps). */
function estimateTextureBytes(texture: Texture): number {
	const img = texture.image as { width?: number; height?: number } | null;
	const w = img?.width ?? 0;
	const h = img?.height ?? 0;
	if (w === 0 || h === 0) return 0;
	// RGBA 8-bit × mipmap factor (~1.33)
	return Math.ceil(w * h * 4 * 1.33);
}

/** Extract textures from a material by checking common texture properties. */
function getTexturesFromMaterial(material: Material): Texture[] {
	const textures: Texture[] = [];
	const mat = material as unknown as Record<string, unknown>;
	const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'envMap', 'alphaMap'];
	for (const prop of textureProps) {
		if (mat[prop] && typeof mat[prop] === 'object' && 'isTexture' in (mat[prop] as object)) {
			textures.push(mat[prop] as Texture);
		}
	}
	return textures;
}

/**
 * Audit GPU resources across scene graphs.
 *
 * Usage:
 * ```ts
 * const auditor = new ResourceAuditor();
 * const report = auditor.audit([
 *   { name: 'Near', scene: layers.near.scene },
 *   { name: 'Far', scene: layers.far.scene },
 *   { name: 'Background', scene: layers.background.scene }
 * ]);
 * ```
 */
export class ResourceAuditor {
	/** Deduplicate resources across traversal to avoid double-counting. */
	private seenGeometries = new Set<number>();
	private seenMaterials = new Set<number>();
	private seenTextures = new Set<number>();

	audit(scenes: { name: string; scene: Scene }[]): ResourceAuditReport {
		this.seenGeometries.clear();
		this.seenMaterials.clear();
		this.seenTextures.clear();

		const layers: LayerReport[] = [];
		for (const { name, scene } of scenes) {
			layers.push(this.auditScene(name, scene));
		}

		const totals = {
			objects: 0,
			geometries: 0,
			materials: 0,
			textures: 0,
			estimatedGeometryBytes: 0,
			estimatedTextureBytes: 0,
			estimatedTotalBytes: 0
		};
		for (const layer of layers) {
			totals.objects += layer.objects;
			totals.geometries += layer.geometries;
			totals.materials += layer.materials;
			totals.textures += layer.textures;
			totals.estimatedGeometryBytes += layer.estimatedGeometryBytes;
			totals.estimatedTextureBytes += layer.estimatedTextureBytes;
		}
		totals.estimatedTotalBytes = totals.estimatedGeometryBytes + totals.estimatedTextureBytes;

		return { layers, totals };
	}

	private auditScene(name: string, scene: Scene): LayerReport {
		const details: ObjectEntry[] = [];
		let geometries = 0;
		let materials = 0;
		let textures = 0;
		let geoBytes = 0;
		let texBytes = 0;
		let objects = 0;

		scene.traverse((obj: Object3D) => {
			objects++;
			const mesh = obj as { geometry?: BufferGeometry; material?: Material | Material[] };
			if (!mesh.geometry && !mesh.material) return;

			const entry: ObjectEntry = {
				name: obj.name || obj.type,
				type: obj.type,
				geometryVertices: 0,
				geometryBytes: 0,
				textureCount: 0,
				textureBytes: 0
			};

			// Geometry
			if (mesh.geometry && !this.seenGeometries.has(mesh.geometry.id)) {
				this.seenGeometries.add(mesh.geometry.id);
				geometries++;
				const bytes = estimateGeometryBytes(mesh.geometry);
				geoBytes += bytes;
				entry.geometryVertices = mesh.geometry.attributes?.position?.count ?? 0;
				entry.geometryBytes = bytes;
			}

			// Materials and textures
			const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
			for (const mat of mats) {
				const matId = (mat as unknown as { id: number }).id;
				if (!this.seenMaterials.has(matId)) {
					this.seenMaterials.add(matId);
					materials++;
				}
				for (const tex of getTexturesFromMaterial(mat)) {
					if (!this.seenTextures.has(tex.id)) {
						this.seenTextures.add(tex.id);
						textures++;
						const bytes = estimateTextureBytes(tex);
						texBytes += bytes;
						entry.textureCount++;
						entry.textureBytes += bytes;
					}
				}
			}

			if (entry.geometryBytes > 0 || entry.textureBytes > 0) {
				details.push(entry);
			}
		});

		return {
			name,
			objects,
			geometries,
			materials,
			textures,
			estimatedGeometryBytes: geoBytes,
			estimatedTextureBytes: texBytes,
			details
		};
	}

	/** Format a report for console output. */
	static formatReport(report: ResourceAuditReport): string {
		const lines: string[] = ['=== GPU Resource Audit ==='];
		for (const layer of report.layers) {
			lines.push(`\n--- ${layer.name} Scene ---`);
			lines.push(`  Objects: ${layer.objects}  Geo: ${layer.geometries}  Mat: ${layer.materials}  Tex: ${layer.textures}`);
			lines.push(`  Geo mem: ${formatBytes(layer.estimatedGeometryBytes)}  Tex mem: ${formatBytes(layer.estimatedTextureBytes)}`);
			if (layer.details.length > 0) {
				// Sort by total bytes descending
				const sorted = [...layer.details].sort((a, b) => (b.geometryBytes + b.textureBytes) - (a.geometryBytes + a.textureBytes));
				for (const d of sorted.slice(0, 20)) {
					const parts: string[] = [];
					if (d.geometryBytes > 0) parts.push(`geo=${formatBytes(d.geometryBytes)} (${d.geometryVertices} verts)`);
					if (d.textureBytes > 0) parts.push(`tex=${formatBytes(d.textureBytes)} (${d.textureCount})`);
					lines.push(`    ${d.name} [${d.type}]: ${parts.join(', ')}`);
				}
				if (sorted.length > 20) {
					lines.push(`    ... and ${sorted.length - 20} more objects`);
				}
			}
		}
		lines.push(`\n--- Totals ---`);
		const t = report.totals;
		lines.push(`  Objects: ${t.objects}  Geo: ${t.geometries}  Mat: ${t.materials}  Tex: ${t.textures}`);
		lines.push(`  Estimated GPU memory: ${formatBytes(t.estimatedTotalBytes)} (geo: ${formatBytes(t.estimatedGeometryBytes)}, tex: ${formatBytes(t.estimatedTextureBytes)})`);
		return lines.join('\n');
	}

	/** Get a one-line summary suitable for the perf overlay. */
	static summarize(report: ResourceAuditReport): string {
		return `Mem: ~${formatBytes(report.totals.estimatedTotalBytes)}`;
	}
}

/** Format bytes with appropriate unit. */
function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + 'MB';
	if (bytes >= 1_024) return (bytes / 1_024).toFixed(1) + 'KB';
	return bytes + 'B';
}
