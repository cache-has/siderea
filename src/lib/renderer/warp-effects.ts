/**
 * Visual effects coordinator for warp travel.
 *
 * Drives per-frame updates to:
 * - Star field streak elongation (via StarFieldRenderer.updateWarpStreak)
 * - FOV widening during acceleration, narrowing during deceleration
 * - Bloom intensity ramp (brighter during cruise)
 * - Speed line particles radiating from the vanishing point
 *
 * This module does NOT own any of the renderers it modifies — it takes
 * references and applies transient effects based on the current WarpState.
 * When warp ends, all effects are cleanly reset to their pre-warp values.
 */

import {
	BufferGeometry,
	BufferAttribute,
	LineBasicMaterial,
	LineSegments,
	MathUtils,
	Vector3,
	type Scene
} from 'three/webgpu';
import type { StarFieldRenderer } from './star-field';
import type { PostProcessingPipeline } from './post-processing';
import type { CameraController } from './camera-controller';
import type { WarpState } from './warp-controller';
import { WarpPhase } from './warp-controller';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WarpEffectsOptions {
	/** FOV to widen to at peak warp speed. @default 90 */
	peakFov?: number;
	/** Bloom strength multiplier at peak warp. @default 2.0 */
	peakBloomStrength?: number;
	/** Number of speed line segments. @default 120 */
	speedLineCount?: number;
	/** Maximum length of speed lines in world units. @default 0.5 */
	speedLineLength?: number;
	/** Speed line spread radius around the camera. @default 2.0 */
	speedLineRadius?: number;
	/** Peak chromatic aberration strength during warp. @default 3.0 */
	peakChromaticAberration?: number;
	/** Peak barrel distortion strength during warp (tunnel effect). @default 0.8 */
	peakBarrelDistortion?: number;
}

const DEFAULTS: Required<WarpEffectsOptions> = {
	peakFov: 90,
	peakBloomStrength: 2.0,
	speedLineCount: 120,
	speedLineLength: 0.5,
	speedLineRadius: 2.0,
	peakChromaticAberration: 3.0,
	peakBarrelDistortion: 0.8
};

// ─── Speed Lines ─────────────────────────────────────────────────────────────

/**
 * Creates a LineSegments geometry for speed lines that radiate from a
 * vanishing point ahead of the camera during warp.
 *
 * Each "line" is a pair of vertices placed in a cylinder around the camera's
 * forward axis, then stretched along the forward direction proportionally
 * to the warp speed.
 */
function createSpeedLineGeometry(count: number, radius: number): {
	geometry: BufferGeometry;
	positions: Float32Array;
	baseOffsets: Float32Array;
} {
	// Each line = 2 vertices = 6 floats
	const positions = new Float32Array(count * 6);
	// Store the radial offset of each line (for per-frame update)
	const baseOffsets = new Float32Array(count * 3);

	for (let i = 0; i < count; i++) {
		// Random position in a cylinder around the forward axis
		const angle = Math.random() * Math.PI * 2;
		const r = radius * (0.3 + Math.random() * 0.7); // inner 30% → outer 100%
		const x = Math.cos(angle) * r;
		const y = Math.sin(angle) * r;
		const z = -(Math.random() * 3 + 0.5); // ahead of camera (negative Z)

		baseOffsets[i * 3] = x;
		baseOffsets[i * 3 + 1] = y;
		baseOffsets[i * 3 + 2] = z;
	}

	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(positions, 3));

	return { geometry, positions, baseOffsets };
}

// ─── WarpEffects ─────────────────────────────────────────────────────────────

export class WarpEffects {
	private opts: Required<WarpEffectsOptions>;

	// Pre-warp values to restore
	private baseFov = 60;
	private baseBloomStrength = 0.5;
	private active = false;

	// Speed lines
	private speedLines: LineSegments;
	private speedLineMaterial: LineBasicMaterial;
	private speedLinePositions: Float32Array;
	private speedLineBaseOffsets: Float32Array;

	// References (not owned)
	private starField: StarFieldRenderer | null = null;
	private postProcessing: PostProcessingPipeline | null = null;
	private cameraController: CameraController | null = null;

	constructor(scene: Scene, options?: WarpEffectsOptions) {
		this.opts = { ...DEFAULTS, ...options };

		// Create speed line geometry
		const { geometry, positions, baseOffsets } = createSpeedLineGeometry(
			this.opts.speedLineCount,
			this.opts.speedLineRadius
		);
		this.speedLinePositions = positions;
		this.speedLineBaseOffsets = baseOffsets;

		this.speedLineMaterial = new LineBasicMaterial({
			color: 0x88aaff,
			transparent: true,
			opacity: 0,
			depthWrite: false
		});

		this.speedLines = new LineSegments(geometry, this.speedLineMaterial);
		this.speedLines.frustumCulled = false;
		this.speedLines.visible = false;
		scene.add(this.speedLines);
	}

	/** Bind references to the systems this effect modifies. */
	bind(refs: {
		starField?: StarFieldRenderer | null;
		postProcessing?: PostProcessingPipeline | null;
		cameraController?: CameraController | null;
	}): void {
		this.starField = refs.starField ?? null;
		this.postProcessing = refs.postProcessing ?? null;
		this.cameraController = refs.cameraController ?? null;
	}

	/**
	 * Update visual effects for the current frame.
	 * Call with null when not warping to reset effects.
	 */
	update(state: WarpState | null, cameraPosition: Vector3, cameraForward: Vector3): void {
		if (!state || state.phase === WarpPhase.IDLE) {
			if (this.active) {
				this.reset();
			}
			return;
		}

		// First frame of warp — capture baseline values
		if (!this.active) {
			this.baseFov = this.cameraController?.getFov() ?? 60;
			this.baseBloomStrength = this.postProcessing?.bloomStrength ?? 0.5;
			this.active = true;
			this.speedLines.visible = true;
		}

		const { speedFraction, velocity } = state;

		// --- Star streak effect ---
		if (this.starField) {
			// Project velocity direction to a simple screen-space approximation.
			// The camera looks down -Z, so the forward velocity component maps to
			// screen Y (upward streaks). We use the velocity's XY components in
			// view space for the streak direction.
			// For simplicity, use (0, 1) as the streak direction — this creates
			// vertical streaks which look correct for forward travel.
			this.starField.updateWarpStreak(speedFraction, 0, 1);
		}

		// --- FOV widening ---
		if (this.cameraController) {
			const targetFov = MathUtils.lerp(this.baseFov, this.opts.peakFov, speedFraction);
			this.cameraController.setFov(targetFov, false);
		}

		// --- Bloom intensity ---
		if (this.postProcessing) {
			const targetBloom = MathUtils.lerp(
				this.baseBloomStrength,
				this.opts.peakBloomStrength,
				speedFraction
			);
			this.postProcessing.bloomStrength = targetBloom;

			// --- Chromatic aberration (color fringing at screen edges) ---
			this.postProcessing.chromaticAberration = this.opts.peakChromaticAberration * speedFraction;

			// --- Barrel distortion (tunnel/vortex effect) ---
			this.postProcessing.barrelDistortion = this.opts.peakBarrelDistortion * speedFraction;
		}

		// --- Speed lines ---
		this.updateSpeedLines(speedFraction, cameraPosition, cameraForward);
	}

	private updateSpeedLines(
		speedFraction: number,
		cameraPosition: Vector3,
		cameraForward: Vector3
	): void {
		const count = this.opts.speedLineCount;
		const maxLen = this.opts.speedLineLength;
		const lineLength = maxLen * speedFraction;

		// Speed lines opacity: fade in/out with speed
		this.speedLineMaterial.opacity = speedFraction * 0.6;

		// Position speed lines relative to camera
		const positions = this.speedLinePositions;
		const offsets = this.speedLineBaseOffsets;

		for (let i = 0; i < count; i++) {
			const ox = offsets[i * 3];
			const oy = offsets[i * 3 + 1];
			const oz = offsets[i * 3 + 2];

			// Start point: offset from camera
			const sx = cameraPosition.x + ox;
			const sy = cameraPosition.y + oy;
			const sz = cameraPosition.z + oz;

			// End point: extended along camera forward by line length
			const ex = sx - cameraForward.x * lineLength;
			const ey = sy - cameraForward.y * lineLength;
			const ez = sz - cameraForward.z * lineLength;

			const idx = i * 6;
			positions[idx] = sx;
			positions[idx + 1] = sy;
			positions[idx + 2] = sz;
			positions[idx + 3] = ex;
			positions[idx + 4] = ey;
			positions[idx + 5] = ez;
		}

		this.speedLines.geometry.attributes.position.needsUpdate = true;
	}

	/** Reset all effects to pre-warp values. */
	private reset(): void {
		this.active = false;

		// Reset star streak
		this.starField?.updateWarpStreak(0);

		// Restore FOV
		if (this.cameraController) {
			this.cameraController.setFov(this.baseFov, true);
		}

		// Restore bloom and clear warp distortion effects
		if (this.postProcessing) {
			this.postProcessing.bloomStrength = this.baseBloomStrength;
			this.postProcessing.chromaticAberration = 0;
			this.postProcessing.barrelDistortion = 0;
		}

		// Hide speed lines
		this.speedLines.visible = false;
		this.speedLineMaterial.opacity = 0;
	}

	dispose(): void {
		this.speedLines.removeFromParent();
		this.speedLines.geometry.dispose();
		this.speedLineMaterial.dispose();
	}
}
