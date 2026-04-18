import { describe, it, expect, vi } from 'vitest';
import { Scene } from 'three/webgpu';
import { OrbitPathRenderer } from './orbit-paths';
import { METERS_PER_AU } from './scale';

/** Generate a fake circular orbit path (flat array of meters). */
function makeFakeOrbitPath(steps: number, radiusAU: number): Float64Array {
	const arr = new Float64Array(steps * 3);
	for (let i = 0; i < steps; i++) {
		const angle = (2 * Math.PI * i) / steps;
		arr[i * 3] = Math.cos(angle) * radiusAU * METERS_PER_AU;
		arr[i * 3 + 1] = Math.sin(angle) * radiusAU * METERS_PER_AU;
		arr[i * 3 + 2] = 0;
	}
	return arr;
}

function makeMockWasm() {
	return {
		get_planet_orbit_path: vi.fn(
			(_bodyId: number, _jdStart: number, _jdEnd: number, steps: number) =>
				makeFakeOrbitPath(steps, 1.0)
		),
		get_body_orbit_path: vi.fn(
			(_bodyId: number, numPoints: number) =>
				makeFakeOrbitPath(numPoints, 39.5)
		)
	};
}

describe('OrbitPathRenderer', () => {
	it('creates orbit lines for planets when WASM is provided', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });

		const periods = new Map([[3, 365.256]]);
		renderer.computeOrbits(2451545.0, periods);

		const line = renderer.getLine(3);
		expect(line).toBeDefined();
		renderer.dispose();
	});

	it('calls WASM with correct time range (one full period centered on JD)', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm, pathResolution: 128 });

		const jd = 2451545.0;
		const period = 365.256;
		renderer.computeOrbits(jd, new Map([[3, period]]));

		expect(wasm.get_planet_orbit_path).toHaveBeenCalledWith(
			3,
			jd - period / 2,
			jd + period / 2,
			128
		);
		renderer.dispose();
	});

	it('adds and removes orbit lines from a scene', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));

		const scene = new Scene();
		renderer.addTo(scene);
		expect(scene.children.length).toBe(1);

		renderer.removeFrom(scene);
		expect(scene.children.length).toBe(0);
		renderer.dispose();
	});

	it('toggles visibility of individual orbits', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));

		renderer.setVisible(3, false);
		expect(renderer.getLine(3)!.visible).toBe(false);

		renderer.setVisible(3, true);
		expect(renderer.getLine(3)!.visible).toBe(true);
		renderer.dispose();
	});

	it('warns and skips when no WASM is provided', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const renderer = new OrbitPathRenderer();

		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('No WASM'));
		expect(renderer.getLine(3)).toBeUndefined();

		warn.mockRestore();
		renderer.dispose();
	});

	it('setVisibleWhere toggles orbits matching a predicate', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365], [4, 687]]));

		// Hide only Earth orbit
		renderer.setVisibleWhere((id) => id === 3, false);
		expect(renderer.getLine(3)!.visible).toBe(false);
		expect(renderer.getLine(4)!.visible).toBe(true);

		// Show it back
		renderer.setVisibleWhere((id) => id === 3, true);
		expect(renderer.getLine(3)!.visible).toBe(true);
		renderer.dispose();
	});

	it('disposes cleanly without errors', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365], [4, 687]]));

		expect(() => renderer.dispose()).not.toThrow();
		expect(renderer.getLine(3)).toBeUndefined();
	});

	it('creates orbits with fade enabled by default', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));

		const line = renderer.getLine(3)!;
		// When fade is enabled, dashed is true (used to access lineDistance)
		expect(line.material.dashed).toBe(true);
		renderer.dispose();
	});

	it('creates orbits without fade when disabled', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm, fadeEnabled: false });
		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));

		const line = renderer.getLine(3)!;
		expect(line.material.dashed).toBe(false);
		renderer.dispose();
	});

	it('updateBodyProgress does not throw', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));

		expect(() => renderer.updateBodyProgress(3, 1.0, 0, 0)).not.toThrow();
		renderer.dispose();
	});

	it('updateAllBodyProgress calls updateBodyProgress for each orbit', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));

		const mockMesh = { position: { x: 1.0, y: 0, z: 0 } };
		expect(() => renderer.updateAllBodyProgress(() => mockMesh)).not.toThrow();
		renderer.dispose();
	});

	it('setDashed toggles dashing mode', () => {
		const wasm = makeMockWasm();
		const renderer = new OrbitPathRenderer({ wasm });
		renderer.computeOrbits(2451545.0, new Map([[3, 365]]));

		renderer.setDashed(3, true, 0.1, 0.05);
		const line = renderer.getLine(3)!;
		expect(line.material.dashed).toBe(true);

		renderer.setDashed(3, false);
		// With fade enabled, dashed stays true but with invisible dashes
		expect(line.material.dashed).toBe(true);

		renderer.dispose();
	});
});
