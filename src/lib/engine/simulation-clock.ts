/**
 * Simulation clock with configurable time scaling.
 *
 * Manages the simulation Julian Date, advancing it each frame by
 * `delta * timeScale`. Supports pause, preset speed multipliers,
 * and reset to real time.
 *
 * The clock starts synchronized to the system clock at 1x speed.
 */

/** Convert a JS Date to Julian Date. */
function dateToJD(date: Date): number {
	return 2440587.5 + date.getTime() / 86_400_000;
}

/** Convert a Julian Date to a JS Date. */
function jdToDate(jd: number): Date {
	return new Date((jd - 2440587.5) * 86_400_000);
}

/** Available time scale presets. */
export const TIME_SCALE_PRESETS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000] as const;

/** Date range limits — VSOP87 accuracy degrades significantly outside this. */
export const SIM_DATE_MIN = new Date('1900-01-01T00:00:00Z');
export const SIM_DATE_MAX = new Date('2200-12-31T23:59:59Z');
const JD_MIN = dateToJD(SIM_DATE_MIN);
const JD_MAX = dateToJD(SIM_DATE_MAX);

/** Seconds per Julian day. */
const SECONDS_PER_DAY = 86_400;

export class SimulationClock {
	/** Current simulation Julian Date. */
	private _jd: number;
	/** Time scale multiplier (1 = real-time). */
	private _timeScale: number = 1;
	/** Whether the clock is paused. */
	private _paused: boolean = false;

	constructor() {
		this._jd = dateToJD(new Date());
	}

	/** Current simulation Julian Date. */
	get jd(): number {
		return this._jd;
	}

	/** Current simulation date as a JS Date. */
	get date(): Date {
		return jdToDate(this._jd);
	}

	/** Current time scale multiplier. */
	get timeScale(): number {
		return this._timeScale;
	}

	set timeScale(scale: number) {
		this._timeScale = Math.max(0, scale);
	}

	/** Whether the clock is paused. */
	get paused(): boolean {
		return this._paused;
	}

	set paused(v: boolean) {
		this._paused = v;
	}

	/**
	 * Advance the clock by a frame delta (in seconds).
	 * Call once per frame with the renderer's delta time.
	 */
	tick(deltaSec: number): void {
		if (this._paused) return;
		// Convert delta seconds to Julian days, apply time scale
		this._jd += (deltaSec * this._timeScale) / SECONDS_PER_DAY;
		// Clamp to valid ephemeris range
		if (this._jd < JD_MIN) { this._jd = JD_MIN; this._paused = true; }
		if (this._jd > JD_MAX) { this._jd = JD_MAX; this._paused = true; }
	}

	/** Reset to the current real-world time and 1x speed. */
	reset(): void {
		this._jd = dateToJD(new Date());
		this._timeScale = 1;
		this._paused = false;
	}

	/** Set the simulation to a specific Julian Date, clamped to valid range. */
	setJD(jd: number): void {
		this._jd = Math.max(JD_MIN, Math.min(JD_MAX, jd));
	}

	/** Set the simulation to a specific JS Date, clamped to valid range. */
	setDate(date: Date): void {
		this._jd = Math.max(JD_MIN, Math.min(JD_MAX, dateToJD(date)));
	}

	/** Toggle pause state. */
	togglePause(): void {
		this._paused = !this._paused;
	}

	/** Whether the clock is running faster than real-time. */
	get isAccelerated(): boolean {
		return this._timeScale > 1;
	}

	/** Format the current sim date for display. */
	get dateString(): string {
		const d = this.date;
		return d.toISOString().slice(0, 10);
	}

	/** Format the current sim date+time for display. */
	get dateTimeString(): string {
		const d = this.date;
		return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
	}
}
