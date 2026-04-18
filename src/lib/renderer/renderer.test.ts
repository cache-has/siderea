/**
 * Unit tests for SidereaRenderer configuration.
 *
 * These tests verify constructor behavior, option defaults, and configuration
 * without requiring a real GPU context (no actual rendering).
 *
 * The WebGPURenderer constructor kicks off a deferred async backend init.
 * We provide a minimal WebGL context stub so it doesn't throw in Node.
 */

import { describe, it, expect, vi } from 'vitest';
import { ACESFilmicToneMapping, SRGBColorSpace, Color } from 'three/webgpu';
import { SidereaRenderer } from './renderer';
import { ScaleSpace } from './scale';

// Provide browser globals that WebGPURenderer's internal Animation class expects.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
	vi.stubGlobal('requestAnimationFrame', () => 0);
	vi.stubGlobal('cancelAnimationFrame', () => {});
}
if (typeof globalThis.self === 'undefined') {
	vi.stubGlobal('self', globalThis);
}

/** Minimal WebGL context stub — just enough for WebGLBackend.init() to survive. */
function makeGLStub() {
	const noop = () => {};
	return {
		getSupportedExtensions: () => [],
		getExtension: () => null,
		getParameter: () => 0,
		getShaderPrecisionFormat: () => ({ rangeMin: 1, rangeMax: 1, precision: 1 }),
		createBuffer: noop,
		createFramebuffer: noop,
		createRenderbuffer: noop,
		createTexture: noop,
		createProgram: noop,
		createShader: noop,
		bindBuffer: noop,
		bindFramebuffer: noop,
		bindRenderbuffer: noop,
		bindTexture: noop,
		blendEquation: noop,
		blendFunc: noop,
		blendFuncSeparate: noop,
		bufferData: noop,
		clear: noop,
		clearColor: noop,
		clearDepth: noop,
		clearStencil: noop,
		colorMask: noop,
		compileShader: noop,
		cullFace: noop,
		deleteBuffer: noop,
		deleteFramebuffer: noop,
		deleteProgram: noop,
		deleteRenderbuffer: noop,
		deleteShader: noop,
		deleteTexture: noop,
		depthFunc: noop,
		depthMask: noop,
		disable: noop,
		drawArrays: noop,
		drawElements: noop,
		enable: noop,
		frontFace: noop,
		generateMipmap: noop,
		getAttribLocation: () => 0,
		getProgramParameter: () => true,
		getProgramInfoLog: () => '',
		getShaderParameter: () => true,
		getShaderInfoLog: () => '',
		getUniformLocation: () => null,
		lineWidth: noop,
		linkProgram: noop,
		pixelStorei: noop,
		scissor: noop,
		shaderSource: noop,
		stencilFunc: noop,
		stencilMask: noop,
		stencilOp: noop,
		texParameteri: noop,
		uniform1f: noop,
		uniform1i: noop,
		useProgram: noop,
		viewport: noop,
		drawingBufferWidth: 800,
		drawingBufferHeight: 600,
		drawingBufferColorSpace: 'srgb',
		canvas: null as unknown
	};
}

function makeMockDocument() {
	const noop = () => {};
	return {
		addEventListener: noop,
		removeEventListener: noop,
		exitPointerLock: noop,
		pointerLockElement: null
	};
}

function makeCanvas(): HTMLCanvasElement {
	const noop = () => {};
	const canvas = {
		width: 800,
		height: 600,
		getBoundingClientRect: () => ({
			width: 800,
			height: 600,
			top: 0,
			left: 0,
			right: 800,
			bottom: 600,
			x: 0,
			y: 0,
			toJSON: () => '{}'
		}),
		getContext: () => {
			const gl = makeGLStub();
			gl.canvas = canvas;
			return gl;
		},
		addEventListener: noop,
		removeEventListener: noop,
		requestPointerLock: noop,
		ownerDocument: makeMockDocument(),
		style: {}
	} as unknown as HTMLCanvasElement;
	return canvas;
}

describe('SidereaRenderer', () => {
	it('creates a renderer with correct defaults', () => {
		const sr = new SidereaRenderer({ canvas: makeCanvas() });
		// Tone mapping + color space are applied in the post-processing
		// pipeline via renderOutput(), not on the renderer directly
		// (to avoid double tone mapping from RenderPipeline context propagation).
		expect(sr.renderer.toneMappingExposure).toBe(1.0);
	});

	it('exposes three scene layers', () => {
		const sr = new SidereaRenderer({ canvas: makeCanvas() });
		expect(sr.layers.background.space).toBe(ScaleSpace.BACKGROUND);
		expect(sr.layers.far.space).toBe(ScaleSpace.FAR);
		expect(sr.layers.near.space).toBe(ScaleSpace.NEAR);
	});

	it('background layer has black background, others are null', () => {
		const sr = new SidereaRenderer({ canvas: makeCanvas() });
		expect(sr.layers.background.scene.background).toBeInstanceOf(Color);
		expect((sr.layers.background.scene.background as Color).getHex()).toBe(0x000000);
		expect(sr.layers.far.scene.background).toBeNull();
		expect(sr.layers.near.scene.background).toBeNull();
	});

	it('camera is an alias for layers.near.camera', () => {
		const sr = new SidereaRenderer({ canvas: makeCanvas() });
		expect(sr.camera).toBe(sr.layers.near.camera);
	});

	it('camera has correct aspect ratio from canvas', () => {
		const sr = new SidereaRenderer({ canvas: makeCanvas() });
		expect(sr.camera.aspect).toBeCloseTo(800 / 600, 2);
		expect(sr.camera.fov).toBe(60);
	});

	it('caps pixel ratio at 2', () => {
		const sr = new SidereaRenderer({ canvas: makeCanvas() });
		expect(sr.renderer.getPixelRatio()).toBeLessThanOrEqual(2);
	});

	it('disposes without error', () => {
		const sr = new SidereaRenderer({ canvas: makeCanvas() });
		sr.dispose();
	});
});
