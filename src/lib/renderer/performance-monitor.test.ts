/**
 * Unit tests for PerformanceMonitor.
 *
 * Tests stat computation without a real GPU — the renderer.info object
 * is stubbed to return known values.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceMonitor } from './performance-monitor';
import type { WebGPURenderer } from 'three/webgpu';

function makeRendererStub(overrides?: {
	calls?: number;
	triangles?: number;
	points?: number;
	lines?: number;
	textures?: number;
	geometries?: number;
}): WebGPURenderer {
	return {
		info: {
			render: {
				calls: overrides?.calls ?? 3,
				triangles: overrides?.triangles ?? 1000,
				points: overrides?.points ?? 120000,
				lines: overrides?.lines ?? 0
			},
			memory: {
				textures: overrides?.textures ?? 5,
				geometries: overrides?.geometries ?? 2
			}
		}
	} as unknown as WebGPURenderer;
}

describe('PerformanceMonitor', () => {
	let monitor: PerformanceMonitor;
	let rendererStub: WebGPURenderer;

	beforeEach(() => {
		rendererStub = makeRendererStub();
		// Disable keyboard toggle in tests (no DOM)
		monitor = new PerformanceMonitor(rendererStub, { toggleKey: null });
	});

	afterEach(() => {
		monitor.dispose();
	});

	it('starts with zeroed stats', () => {
		const s = monitor.stats;
		expect(s.fps).toBe(0);
		expect(s.frameTime).toBe(0);
		expect(s.drawCalls).toBe(0);
	});

	it('computes FPS from frame times', () => {
		// Simulate 10 frames at ~16.67ms each (60fps)
		for (let i = 0; i < 10; i++) {
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(i * 16.67) // begin
				.mockReturnValueOnce(i * 16.67 + 16.67); // end
			monitor.begin();
			monitor.end();
		}

		const s = monitor.stats;
		expect(s.fps).toBeCloseTo(60, 0);
		expect(s.avgFrameTime).toBeCloseTo(16.67, 0);
	});

	it('tracks min and max frame times', () => {
		const frameTimes = [10, 20, 5, 30, 15];
		let clock = 0;

		for (const ft of frameTimes) {
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(clock)
				.mockReturnValueOnce(clock + ft);
			monitor.begin();
			monitor.end();
			clock += ft;
		}

		expect(monitor.stats.minFrameTime).toBe(5);
		expect(monitor.stats.maxFrameTime).toBe(30);
	});

	it('reads renderer info for draw calls and triangles', () => {
		vi.spyOn(performance, 'now')
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(16);
		monitor.begin();
		monitor.end();

		const s = monitor.stats;
		expect(s.drawCalls).toBe(3);
		expect(s.triangles).toBe(1000);
		expect(s.points).toBe(120000);
		expect(s.textures).toBe(5);
		expect(s.geometries).toBe(2);
	});

	it('rolling window caps at sampleSize', () => {
		const small = new PerformanceMonitor(rendererStub, {
			sampleSize: 3,
			toggleKey: null
		});

		// Push 5 frames: 10, 20, 30, 40, 50
		// Window of 3 should keep only last 3: 30, 40, 50
		const times = [10, 20, 30, 40, 50];
		let clock = 0;
		for (const ft of times) {
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(clock)
				.mockReturnValueOnce(clock + ft);
			small.begin();
			small.end();
			clock += ft;
		}

		// avg of [30, 40, 50] = 40
		expect(small.stats.avgFrameTime).toBeCloseTo(40, 1);
		expect(small.stats.minFrameTime).toBe(30);
		expect(small.stats.maxFrameTime).toBe(50);

		small.dispose();
	});

	it('visibility defaults to hidden', () => {
		expect(monitor.visible).toBe(false);
	});

	it('toggle flips visibility state', () => {
		// Without a DOM, show/hide just track the boolean
		monitor.show();
		expect(monitor.visible).toBe(true);
		monitor.toggle();
		expect(monitor.visible).toBe(false);
		monitor.toggle();
		expect(monitor.visible).toBe(true);
	});

	it('dispose is safe to call multiple times', () => {
		monitor.dispose();
		monitor.dispose(); // should not throw
	});

	describe('phase timing', () => {
		it('tracks named phases within a frame', () => {
			const m = new PerformanceMonitor(rendererStub, { toggleKey: null, sampleSize: 3 });

			// Frame: begin -> ui(2ms) -> wasm(1ms) -> render(8ms) -> end
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(0)    // begin
				.mockReturnValueOnce(0)    // markPhase('ui')
				.mockReturnValueOnce(2)    // markPhase('wasm') closes ui=2ms
				.mockReturnValueOnce(3)    // markPhase('render') closes wasm=1ms
				.mockReturnValueOnce(11);  // end closes render=8ms, frameTime=11
			m.begin();
			m.markPhase('ui');
			m.markPhase('wasm');
			m.markPhase('render');
			m.end();

			const phases = m.stats.phases;
			expect(phases).toHaveLength(3);
			expect(phases[0].name).toBe('ui');
			expect(phases[0].avgMs).toBeCloseTo(2, 1);
			expect(phases[1].name).toBe('wasm');
			expect(phases[1].avgMs).toBeCloseTo(1, 1);
			expect(phases[2].name).toBe('render');
			expect(phases[2].avgMs).toBeCloseTo(8, 1);

			m.dispose();
		});

		it('applies budget targets from options', () => {
			const m = new PerformanceMonitor(rendererStub, {
				toggleKey: null,
				phaseBudgets: { wasm: 2, render: 10 }
			});

			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(0)    // begin
				.mockReturnValueOnce(0)    // markPhase('wasm')
				.mockReturnValueOnce(1)    // markPhase('render')
				.mockReturnValueOnce(5);   // end
			m.begin();
			m.markPhase('wasm');
			m.markPhase('render');
			m.end();

			expect(m.stats.phases[0].budgetMs).toBe(2);
			expect(m.stats.phases[1].budgetMs).toBe(10);

			m.dispose();
		});

		it('resets phase tracking each frame', () => {
			const m = new PerformanceMonitor(rendererStub, { toggleKey: null, sampleSize: 2 });

			// Frame 1: begin(0), markPhase('a')(0), markPhase('b')(5), end(10)
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(0).mockReturnValueOnce(0)
				.mockReturnValueOnce(5).mockReturnValueOnce(10);
			m.begin();
			m.markPhase('a');
			m.markPhase('b');
			m.end();

			// Frame 2: begin(10), markPhase('a')(10), markPhase('b')(12), end(20)
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(10).mockReturnValueOnce(10)
				.mockReturnValueOnce(12).mockReturnValueOnce(20);
			m.begin();
			m.markPhase('a');
			m.markPhase('b');
			m.end();

			// Rolling average of 2 frames: a=[5,2]=3.5, b=[5,8]=6.5
			expect(m.stats.phases[0].avgMs).toBeCloseTo(3.5, 1);
			expect(m.stats.phases[1].avgMs).toBeCloseTo(6.5, 1);

			m.dispose();
		});
	});
});
