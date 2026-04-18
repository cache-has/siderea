/**
 * Core renderer for Siderea.
 *
 * Wraps Three.js WebGPURenderer (auto-fallback to WebGL2) with:
 * - Multi-scale scene layers (background / far / near)
 * - Render loop management (requestAnimationFrame)
 * - Canvas resize handling (ResizeObserver)
 * - Tone mapping (ACESFilmic) and color space (sRGB output, linear working)
 * - Post-processing pipeline (multi-scene compositing + bloom)
 */

import {
	WebGPURenderer,
	ACESFilmicToneMapping,
	SRGBColorSpace,
	Clock
} from 'three/webgpu';
import { SceneLayerManager } from './scene-layers';
import { PostProcessingPipeline, type PostProcessingOptions } from './post-processing';
import { CameraController, type CameraControllerOptions, CameraMode } from './camera-controller';
import { PerformanceMonitor, type PerformanceMonitorOptions } from './performance-monitor';
import { SceneObjectPool, type SceneObjectPoolOptions } from './object-pool';
import type { PerspectiveCamera } from 'three/webgpu';

export interface RendererOptions {
	canvas: HTMLCanvasElement;
	antialias?: boolean;
	postProcessing?: PostProcessingOptions;
	/** Camera controller options (omit camera/canvas/layers — those are set automatically). */
	cameraController?: Partial<Omit<CameraControllerOptions, 'camera' | 'canvas' | 'layers'>>;
	/** Performance monitor options. Pass false to disable entirely. */
	performanceMonitor?: PerformanceMonitorOptions | false;
	/** Object pool options for dynamic scene objects (satellites, asteroids, etc.). */
	objectPool?: SceneObjectPoolOptions;
	onFrame?: (delta: number, elapsed: number) => void;
}

/** Maximum device pixel ratio to use (3x Retina isn't worth the GPU cost). */
const MAX_PIXEL_RATIO = 2;

export class SidereaRenderer {
	readonly renderer: WebGPURenderer;
	readonly layers: SceneLayerManager;
	readonly cameraController: CameraController;
	readonly perfMonitor: PerformanceMonitor | null;
	readonly objectPool: SceneObjectPool;
	postProcessing: PostProcessingPipeline | null = null;

	private clock = new Clock();
	private animationId: number | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private onFrame: ((delta: number, elapsed: number) => void) | null;
	private canvas: HTMLCanvasElement;
	private postProcessingOptions: PostProcessingOptions;

	/** Convenience alias for the primary (near) camera. */
	get camera(): PerspectiveCamera {
		return this.layers.near.camera;
	}

	constructor(options: RendererOptions) {
		this.canvas = options.canvas;
		this.onFrame = options.onFrame ?? null;
		this.postProcessingOptions = options.postProcessing ?? {};

		this.renderer = new WebGPURenderer({
			canvas: this.canvas,
			antialias: options.antialias ?? true,
			alpha: false
		});

		const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
		this.renderer.setPixelRatio(Math.min(dpr, MAX_PIXEL_RATIO));

		// Tone mapping and color space are applied in the post-processing
		// pipeline via explicit renderOutput(). Do NOT set them here —
		// RenderPipeline propagates these settings via context to pass nodes,
		// causing double tone mapping when renderOutput() adds its own.
		this.renderer.toneMappingExposure = 1.0;

		// Scene layers
		const { width, height } = this.canvas.getBoundingClientRect();
		const aspect = width / height || 1;
		this.layers = new SceneLayerManager(aspect);

		// Position the primary camera at a reasonable default
		this.camera.position.z = 5;

		// Camera controller
		this.cameraController = new CameraController({
			camera: this.camera,
			canvas: this.canvas,
			layers: this.layers,
			...options.cameraController
		});

		// Object pool for dynamic scene objects
		this.objectPool = new SceneObjectPool(options.objectPool ?? {});

		// Performance monitor (enabled by default, pass false to disable)
		if (options.performanceMonitor !== false) {
			this.perfMonitor = new PerformanceMonitor(
				this.renderer,
				options.performanceMonitor ?? {}
			);
		} else {
			this.perfMonitor = null;
		}
	}

	/**
	 * Initialize the renderer (required for WebGPU). Must be called before start().
	 * Sets up post-processing pipeline and resize observer.
	 */
	async init(): Promise<void> {
		await this.renderer.init();

		// Log which backend we got
		const backend = this.renderer.backend;
		const name = backend?.constructor?.name ?? 'unknown';
		console.info(`[Siderea] Renderer initialized: ${name}`);

		// Post-processing with multi-scene compositing
		this.postProcessing = new PostProcessingPipeline(
			this.renderer,
			this.layers,
			this.postProcessingOptions
		);

		// Initial size
		this.handleResize();

		// Observe canvas size changes
		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.canvas);
	}

	/** Start the render loop. */
	start(): void {
		if (this.animationId !== null) return;
		this.clock.start();
		this.tick();
	}

	/** Stop the render loop. */
	stop(): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
		this.clock.stop();
	}

	/** Clean up all resources. */
	dispose(): void {
		this.stop();
		this.objectPool.dispose();
		this.cameraController.dispose();
		this.perfMonitor?.dispose();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.postProcessing?.dispose();
		this.postProcessing = null;
		this.renderer.dispose();
	}

	private tick = (): void => {
		this.animationId = requestAnimationFrame(this.tick);
		this.perfMonitor?.begin();

		const delta = this.clock.getDelta();
		const elapsed = this.clock.getElapsedTime();

		this.onFrame?.(delta, elapsed);

		// Update camera controller (orbit/free-fly damping, transitions, FOV)
		this.cameraController.update(delta);

		// Sync far + background cameras from the primary (near) camera
		this.layers.syncCameras();

		this.perfMonitor?.markPhase('render');
		if (this.postProcessing) {
			this.postProcessing.render();
		}

		this.perfMonitor?.end();
	};

	private handleResize(): void {
		const { width, height } = this.canvas.getBoundingClientRect();
		if (width === 0 || height === 0) return;

		this.renderer.setSize(width, height, false);
		this.layers.setAspect(width / height);
		this.postProcessing?.setSize(width, height);
	}
}
