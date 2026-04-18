/**
 * Performance monitoring for the Siderea renderer.
 *
 * Tracks FPS, frame times, and renderer stats (draw calls, triangles, etc.).
 * Provides a lightweight DOM overlay for dev-mode visibility, toggled via
 * keyboard shortcut (backtick/tilde by default) or programmatic API.
 *
 * Frame time sampling uses a rolling window for stable averages.
 */

import type { WebGPURenderer } from 'three/webgpu';
import { ResourceAuditor, type ResourceAuditReport } from './resource-auditor';
import type { Scene } from 'three/webgpu';

/** Per-phase timing breakdown for frame budget tracking. */
export interface PhaseTiming {
	/** Phase name (e.g. 'wasm', 'sceneGraph', 'render', 'ui'). */
	name: string;
	/** Last frame time for this phase in milliseconds. */
	lastMs: number;
	/** Rolling average time in milliseconds. */
	avgMs: number;
	/** Budget target in milliseconds (0 = no budget). */
	budgetMs: number;
}

/** Snapshot of performance stats at a point in time. */
export interface PerformanceStats {
	/** Frames per second (rolling average over sample window). */
	fps: number;
	/** Last frame time in milliseconds. */
	frameTime: number;
	/** Average frame time in milliseconds (over sample window). */
	avgFrameTime: number;
	/** Minimum frame time in the current window. */
	minFrameTime: number;
	/** Maximum frame time in the current window. */
	maxFrameTime: number;
	/** Draw calls in the last frame. */
	drawCalls: number;
	/** Triangles rendered in the last frame. */
	triangles: number;
	/** Points rendered in the last frame. */
	points: number;
	/** Lines rendered in the last frame. */
	lines: number;
	/** Number of textures in GPU memory. */
	textures: number;
	/** Number of geometry buffers in GPU memory. */
	geometries: number;
	/** Estimated GPU memory usage string (from resource auditor). */
	estimatedMemory: string;
	/** Per-phase timing breakdown (populated when markPhase is used). */
	phases: PhaseTiming[];
}

/**
 * Frame budget targets per phase (ms). Phases not listed have no budget.
 * At 60fps the total budget is ~16.67ms.
 */
export type PhaseBudgets = Record<string, number>;

export interface PerformanceMonitorOptions {
	/**
	 * Number of frames to average over for FPS/frame-time stats.
	 * @default 60
	 */
	sampleSize?: number;

	/**
	 * How often (in ms) to update the DOM overlay.
	 * Lower = more responsive but slightly more DOM overhead.
	 * @default 250
	 */
	overlayUpdateInterval?: number;

	/**
	 * Keyboard key to toggle overlay visibility.
	 * Set to null to disable keyboard toggle.
	 * @default '`'
	 */
	toggleKey?: string | null;

	/**
	 * Per-phase budget targets in milliseconds.
	 * Phases exceeding their budget are highlighted in the overlay.
	 */
	phaseBudgets?: PhaseBudgets;
}

const DEFAULTS: Required<PerformanceMonitorOptions> = {
	sampleSize: 60,
	overlayUpdateInterval: 250,
	toggleKey: '`',
	phaseBudgets: {}
};

/**
 * Lightweight performance monitor with optional DOM overlay.
 *
 * Usage:
 *   const monitor = new PerformanceMonitor(renderer, { toggleKey: '`' });
 *   // In render loop:
 *   monitor.begin();
 *   // ... render ...
 *   monitor.end();
 *   // Read stats:
 *   const stats = monitor.stats;
 */
export class PerformanceMonitor {
	private renderer: WebGPURenderer;
	private opts: Required<PerformanceMonitorOptions>;

	// Frame timing
	private frameTimes: Float64Array;
	private frameIndex = 0;
	private frameCount = 0;
	private frameStart = 0;

	// Overlay
	private overlay: HTMLDivElement | null = null;
	private overlayVisible = false;
	private lastOverlayUpdate = 0;

	// Cached stats (updated every end() call)
	private cachedStats: PerformanceStats = {
		fps: 0,
		frameTime: 0,
		avgFrameTime: 0,
		minFrameTime: 0,
		maxFrameTime: 0,
		drawCalls: 0,
		triangles: 0,
		points: 0,
		lines: 0,
		textures: 0,
		geometries: 0,
		estimatedMemory: '',
		phases: []
	};

	// Phase timing
	private phaseBudgets: PhaseBudgets;
	private phaseOrder: string[] = [];
	private phaseTimesMap = new Map<string, Float64Array>();
	private phaseCurrentStart = 0;
	private phaseCurrentName: string | null = null;

	// Resource auditor
	private auditor = new ResourceAuditor();
	private auditScenes: { name: string; scene: Scene }[] = [];
	private lastAuditReport: ResourceAuditReport | null = null;
	private auditCounter = 0;
	/** Run a full audit every N frames (expensive traversal). */
	private static readonly AUDIT_INTERVAL = 120;

	// Bound handlers for cleanup
	private onKeyDown: ((e: KeyboardEvent) => void) | null = null;

	constructor(renderer: WebGPURenderer, options: PerformanceMonitorOptions = {}) {
		this.renderer = renderer;
		this.opts = { ...DEFAULTS, ...options };
		this.frameTimes = new Float64Array(this.opts.sampleSize);
		this.phaseBudgets = options.phaseBudgets ?? {};

		if (this.opts.toggleKey !== null && typeof document !== 'undefined') {
			this.onKeyDown = (e: KeyboardEvent) => {
				if (e.key === this.opts.toggleKey) {
					this.toggle();
				}
				// Shift+` logs detailed GPU resource audit to console
				if (e.key === '~' && this.lastAuditReport) {
					console.log(ResourceAuditor.formatReport(this.lastAuditReport));
				}
			};
			document.addEventListener('keydown', this.onKeyDown);
		}
	}

	/**
	 * Register scenes for resource auditing. Call once after scene setup.
	 * The auditor will periodically traverse these scenes to estimate GPU memory.
	 */
	setScenes(scenes: { name: string; scene: Scene }[]): void {
		this.auditScenes = scenes;
	}

	/** Call at the start of each frame (before rendering). */
	begin(): void {
		this.frameStart = performance.now();
		this.phaseCurrentName = null;
		this.phaseCurrentStart = 0;
	}

	/**
	 * Mark the start of a named phase within the current frame.
	 * Closes the previous phase (if any) and starts timing the new one.
	 * Call with distinct names like 'ui', 'wasm', 'sceneGraph', 'render'.
	 */
	markPhase(name: string): void {
		const now = performance.now();

		// Close previous phase
		if (this.phaseCurrentName !== null) {
			this.recordPhase(this.phaseCurrentName, now - this.phaseCurrentStart);
		}

		this.phaseCurrentName = name;
		this.phaseCurrentStart = now;
	}

	private recordPhase(name: string, timeMs: number): void {
		let times = this.phaseTimesMap.get(name);
		if (!times) {
			times = new Float64Array(this.opts.sampleSize);
			this.phaseTimesMap.set(name, times);
			this.phaseOrder.push(name);
		}
		times[this.frameIndex] = timeMs;
	}

	/** Call at the end of each frame (after rendering). Updates stats. */
	end(): void {
		const now = performance.now();
		const frameTime = now - this.frameStart;

		// Close the last open phase
		if (this.phaseCurrentName !== null) {
			this.recordPhase(this.phaseCurrentName, now - this.phaseCurrentStart);
			this.phaseCurrentName = null;
		}

		// Record frame time in rolling buffer
		this.frameTimes[this.frameIndex] = frameTime;
		this.frameIndex = (this.frameIndex + 1) % this.opts.sampleSize;
		if (this.frameCount < this.opts.sampleSize) this.frameCount++;

		// Compute rolling stats
		let sum = 0;
		let min = Infinity;
		let max = 0;
		for (let i = 0; i < this.frameCount; i++) {
			const t = this.frameTimes[i];
			sum += t;
			if (t < min) min = t;
			if (t > max) max = t;
		}
		const avg = sum / this.frameCount;

		// Read renderer info (Three.js resets render.calls etc. each frame)
		const info = this.renderer.info;
		const render = info.render;

		// Periodic resource audit
		if (this.auditScenes.length > 0) {
			this.auditCounter++;
			if (this.auditCounter >= PerformanceMonitor.AUDIT_INTERVAL) {
				this.auditCounter = 0;
				this.lastAuditReport = this.auditor.audit(this.auditScenes);
			}
		}

		// Compute per-phase rolling averages
		const phases: PhaseTiming[] = this.phaseOrder.map((name) => {
			const times = this.phaseTimesMap.get(name)!;
			let phaseSum = 0;
			for (let j = 0; j < this.frameCount; j++) {
				phaseSum += times[j];
			}
			return {
				name,
				lastMs: times[(this.frameIndex - 1 + this.opts.sampleSize) % this.opts.sampleSize],
				avgMs: phaseSum / this.frameCount,
				budgetMs: this.phaseBudgets[name] ?? 0
			};
		});

		this.cachedStats = {
			fps: avg > 0 ? 1000 / avg : 0,
			frameTime,
			avgFrameTime: avg,
			minFrameTime: min === Infinity ? 0 : min,
			maxFrameTime: max,
			drawCalls: render.calls,
			triangles: render.triangles,
			points: render.points,
			lines: render.lines,
			textures: info.memory.textures,
			geometries: info.memory.geometries,
			estimatedMemory: this.lastAuditReport
				? ResourceAuditor.summarize(this.lastAuditReport)
				: '',
			phases
		};

		// Update overlay if visible
		if (this.overlayVisible && now - this.lastOverlayUpdate >= this.opts.overlayUpdateInterval) {
			this.updateOverlay();
			this.lastOverlayUpdate = now;
		}
	}

	/** Current performance stats (updated after each end() call). */
	get stats(): Readonly<PerformanceStats> {
		return this.cachedStats;
	}

	/** Show the DOM overlay. */
	show(): void {
		if (this.overlayVisible) return;
		this.overlayVisible = true;
		this.ensureOverlay();
		if (this.overlay) this.overlay.style.display = 'block';
	}

	/** Hide the DOM overlay. */
	hide(): void {
		if (!this.overlayVisible) return;
		this.overlayVisible = false;
		if (this.overlay) this.overlay.style.display = 'none';
	}

	/** Toggle overlay visibility. */
	toggle(): void {
		if (this.overlayVisible) this.hide();
		else this.show();
	}

	/** Whether the overlay is currently visible. */
	get visible(): boolean {
		return this.overlayVisible;
	}

	/** Clean up DOM elements and event listeners. */
	dispose(): void {
		if (this.onKeyDown && typeof document !== 'undefined') {
			document.removeEventListener('keydown', this.onKeyDown);
			this.onKeyDown = null;
		}
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = null;
		}
	}

	private ensureOverlay(): void {
		if (this.overlay || typeof document === 'undefined') return;

		this.overlay = document.createElement('div');
		this.overlay.style.cssText = [
			'position:fixed',
			'top:8px',
			'left:8px',
			'z-index:10000',
			'background:rgba(0,0,0,0.75)',
			'color:#0f0',
			'font:11px/1.4 monospace',
			'padding:6px 10px',
			'border-radius:4px',
			'pointer-events:none',
			'white-space:pre',
			'user-select:none'
		].join(';');

		document.body.appendChild(this.overlay);
	}

	private updateOverlay(): void {
		if (!this.overlay) return;
		const s = this.cachedStats;

		// Color FPS: green >=55, yellow >=30, red <30
		const fpsColor = s.fps >= 55 ? '#0f0' : s.fps >= 30 ? '#ff0' : '#f44';

		let html =
			`<span style="color:${fpsColor}">${s.fps.toFixed(0)} FPS</span>  ${s.avgFrameTime.toFixed(1)}ms avg\n` +
			`${s.minFrameTime.toFixed(1)}ms min  ${s.maxFrameTime.toFixed(1)}ms max\n` +
			`Draw: ${s.drawCalls}  Tri: ${formatCount(s.triangles)}  Pt: ${formatCount(s.points)}\n` +
			`Tex: ${s.textures}  Geo: ${s.geometries}` +
			(s.estimatedMemory ? `  ${s.estimatedMemory}` : '');

		// Phase budget breakdown
		if (s.phases.length > 0) {
			html += '\n';
			for (const p of s.phases) {
				const color = phaseColor(p);
				const budgetLabel = p.budgetMs > 0 ? `/${p.budgetMs}` : '';
				html += `\n<span style="color:${color}">${p.name}: ${p.avgMs.toFixed(1)}${budgetLabel}ms</span>`;
			}
		}

		this.overlay.innerHTML = html;
	}
}

/** Format large numbers with K/M suffixes. */
function formatCount(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
	return String(n);
}

/** Color a phase by budget status: green under, yellow near (>80%), red over. */
function phaseColor(p: PhaseTiming): string {
	if (p.budgetMs <= 0) return '#888';
	const ratio = p.avgMs / p.budgetMs;
	if (ratio > 1) return '#f44';
	if (ratio > 0.8) return '#ff0';
	return '#0f0';
}
