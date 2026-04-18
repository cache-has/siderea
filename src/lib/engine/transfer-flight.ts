/**
 * Transfer flight controller.
 *
 * Manages the fly-along experience for Hohmann transfers:
 * - Sets time compression to play the transfer in ~45 seconds of real time
 * - Tracks progress through the transfer
 * - Provides camera target position along the transfer path
 * - Decelerates time back to 1x on arrival
 *
 * This controller does NOT directly manipulate the camera or clock —
 * it computes the desired state each frame, and the page component
 * applies it to the SimulationClock, camera, and transfer renderer.
 */

import type { TransferPlan } from '$lib/renderer/transfer-orbit';

/** Desired real-time duration for the fly-along (seconds). */
const FLY_DURATION_SECONDS = 45;

/** Seconds per Julian day. */
const SECONDS_PER_DAY = 86_400;

export class TransferFlight {
	/** The active transfer plan. */
	readonly plan: TransferPlan;
	/** Time scale needed to compress the transfer into FLY_DURATION_SECONDS. */
	readonly requiredTimeScale: number;
	/** Whether the flight is active. */
	private _active = true;
	/** Progress 0-1 through the transfer. */
	private _progress = 0;
	/** Accumulated sim-seconds since departure. */
	private _elapsedSimSeconds = 0;
	/** Previous time scale before the flight started (to restore on cancel). */
	readonly previousTimeScale: number;

	constructor(plan: TransferPlan, previousTimeScale: number) {
		this.plan = plan;
		this.previousTimeScale = previousTimeScale;
		// Compute the time scale: transfer_time (seconds) / desired real-time (seconds)
		this.requiredTimeScale = plan.hohmann.transfer_time / FLY_DURATION_SECONDS;
	}

	/** Current progress 0-1. */
	get progress(): number {
		return this._progress;
	}

	/** Whether the flight is still active. */
	get active(): boolean {
		return this._active;
	}

	/** Whether the flight has completed (arrived at destination). */
	get arrived(): boolean {
		return this._progress >= 1;
	}

	/**
	 * Advance the flight by one frame.
	 * @param simDeltaSeconds How many sim-seconds elapsed this frame
	 *        (= frameDelta * timeScale)
	 * @returns Updated progress (0-1)
	 */
	tick(simDeltaSeconds: number): number {
		if (!this._active) return this._progress;

		this._elapsedSimSeconds += simDeltaSeconds;
		this._progress = Math.min(1, this._elapsedSimSeconds / this.plan.hohmann.transfer_time);

		if (this._progress >= 1) {
			this._active = false;
		}

		return this._progress;
	}

	/** Cancel the flight. */
	cancel(): void {
		this._active = false;
	}
}
