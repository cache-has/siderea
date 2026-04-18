import { describe, it, expect } from 'vitest';
import { ResourceAuditor } from './resource-auditor';
import { Scene, Mesh, SphereGeometry, MeshStandardMaterial, BufferGeometry, Float32BufferAttribute } from 'three/webgpu';

describe('ResourceAuditor', () => {
	it('returns empty report for empty scenes', () => {
		const auditor = new ResourceAuditor();
		const report = auditor.audit([{ name: 'Test', scene: new Scene() }]);

		expect(report.layers).toHaveLength(1);
		expect(report.layers[0].objects).toBeGreaterThanOrEqual(1); // scene root counts as an object
		expect(report.layers[0].geometries).toBe(0);
		expect(report.layers[0].materials).toBe(0);
		expect(report.layers[0].textures).toBe(0);
		expect(report.totals.estimatedTotalBytes).toBe(0);
	});

	it('counts geometries and estimates memory', () => {
		const auditor = new ResourceAuditor();
		const scene = new Scene();
		const geo = new SphereGeometry(1, 8, 8);
		const mat = new MeshStandardMaterial();
		scene.add(new Mesh(geo, mat));

		const report = auditor.audit([{ name: 'Near', scene }]);

		expect(report.layers[0].geometries).toBe(1);
		expect(report.layers[0].materials).toBe(1);
		expect(report.layers[0].estimatedGeometryBytes).toBeGreaterThan(0);
		expect(report.totals.geometries).toBe(1);
	});

	it('deduplicates shared geometries across meshes', () => {
		const auditor = new ResourceAuditor();
		const scene = new Scene();
		const sharedGeo = new SphereGeometry(1, 4, 4);
		scene.add(new Mesh(sharedGeo, new MeshStandardMaterial()));
		scene.add(new Mesh(sharedGeo, new MeshStandardMaterial()));

		const report = auditor.audit([{ name: 'Test', scene }]);

		// Shared geometry counted once, but two materials
		expect(report.layers[0].geometries).toBe(1);
		expect(report.layers[0].materials).toBe(2);
	});

	it('deduplicates across multiple scenes', () => {
		const auditor = new ResourceAuditor();
		const scene1 = new Scene();
		const scene2 = new Scene();
		const geo1 = new SphereGeometry(1, 4, 4);
		const geo2 = new SphereGeometry(2, 8, 8);
		scene1.add(new Mesh(geo1, new MeshStandardMaterial()));
		scene2.add(new Mesh(geo2, new MeshStandardMaterial()));

		const report = auditor.audit([
			{ name: 'Near', scene: scene1 },
			{ name: 'Far', scene: scene2 }
		]);

		expect(report.totals.geometries).toBe(2);
		expect(report.totals.materials).toBe(2);
	});

	it('estimates geometry bytes from buffer attributes', () => {
		const auditor = new ResourceAuditor();
		const scene = new Scene();
		const geo = new BufferGeometry();
		// 100 vertices × 3 floats × 4 bytes = 1200 bytes
		geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(300), 3));
		scene.add(new Mesh(geo, new MeshStandardMaterial()));

		const report = auditor.audit([{ name: 'Test', scene }]);

		expect(report.layers[0].estimatedGeometryBytes).toBe(1200);
	});

	it('formats report as string', () => {
		const auditor = new ResourceAuditor();
		const scene = new Scene();
		scene.add(new Mesh(new SphereGeometry(1, 4, 4), new MeshStandardMaterial()));

		const report = auditor.audit([{ name: 'Near', scene }]);
		const formatted = ResourceAuditor.formatReport(report);

		expect(formatted).toContain('GPU Resource Audit');
		expect(formatted).toContain('Near Scene');
		expect(formatted).toContain('Totals');
	});

	it('produces a one-line summary', () => {
		const auditor = new ResourceAuditor();
		const report = auditor.audit([{ name: 'Test', scene: new Scene() }]);
		const summary = ResourceAuditor.summarize(report);

		expect(summary).toMatch(/^Mem: ~/);
	});
});
