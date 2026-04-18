<script lang="ts">
	import type { SimulationClock } from '$lib/engine/simulation-clock';
	import { TIME_SCALE_PRESETS, SIM_DATE_MIN, SIM_DATE_MAX } from '$lib/engine/simulation-clock';

	interface Props {
		clock: SimulationClock;
		/** Reactive time scale for display (updated per frame from parent). */
		timeScale: number;
		/** Reactive date string (updated per frame from parent). */
		dateString: string;
		/** Reactive pause state. */
		paused: boolean;
	}

	const { clock, timeScale, dateString, paused }: Props = $props();

	let editing = $state(false);
	let inputValue = $state('');

	/** Format for datetime-local input: YYYY-MM-DDTHH:MM */
	const DATE_MIN_STR = SIM_DATE_MIN.toISOString().slice(0, 16);
	const DATE_MAX_STR = SIM_DATE_MAX.toISOString().slice(0, 16);

	function setSpeed(scale: number) {
		clock.timeScale = scale;
		if (clock.paused) clock.paused = false;
	}

	function togglePause() {
		clock.togglePause();
	}

	function resetTime() {
		clock.reset();
	}

	function formatScale(s: number): string {
		if (s >= 1_000_000) return `${s / 1_000_000}M`;
		if (s >= 1_000) return `${s / 1_000}K`;
		return `${s}`;
	}

	function openDatePicker() {
		// Seed input with current sim time
		inputValue = clock.date.toISOString().slice(0, 16);
		editing = true;
	}

	function applyDate() {
		if (!inputValue) return;
		const d = new Date(inputValue + 'Z'); // treat as UTC
		if (!isNaN(d.getTime())) {
			clock.setDate(d);
		}
		editing = false;
	}

	function cancelEdit() {
		editing = false;
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') applyDate();
		if (e.key === 'Escape') cancelEdit();
	}
</script>

<div class="time-controls" role="toolbar" aria-label="Simulation time controls">
	{#if editing}
		<div class="date-picker">
			<input
				type="datetime-local"
				class="date-input"
				bind:value={inputValue}
				min={DATE_MIN_STR}
				max={DATE_MAX_STR}
				onkeydown={onInputKeydown}
				aria-label="Simulation date and time"
			/>
			<div class="date-actions">
				<button class="time-btn go-btn" onclick={applyDate} title="Go to date">Go</button>
				<button class="time-btn cancel-btn" onclick={cancelEdit} title="Cancel">✕</button>
			</div>
		</div>
	{:else}
		<div class="time-date">
			<button class="date-btn" onclick={openDatePicker} title="Pick a date">
				{dateString}
			</button>
		</div>
	{/if}
	<div class="time-row">
		<button
			class="time-btn pause-btn"
			class:active={paused}
			onclick={togglePause}
			title={paused ? 'Resume' : 'Pause'}
			aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
		>
			{paused ? '\u25B6' : '\u23F8'}
		</button>
		{#each TIME_SCALE_PRESETS as preset}
			<button
				class="time-btn speed-btn"
				class:active={timeScale === preset && !paused}
				onclick={() => setSpeed(preset)}
				title="{preset}x speed"
			>
				{formatScale(preset)}x
			</button>
		{/each}
		<button
			class="time-btn reset-btn"
			onclick={resetTime}
			title="Reset to current time"
		>
			Now
		</button>
	</div>
</div>

<style>
	.time-controls {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		background: rgba(10, 12, 20, 0.7);
		border: 1px solid rgba(100, 120, 150, 0.2);
		border-radius: 4px;
		padding: 0.3rem 0.5rem;
		backdrop-filter: blur(4px);
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		z-index: 100;
		pointer-events: auto;
		color: #c0c8d0;
	}

	.time-date {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.date-btn {
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		color: #e0e8f0;
		font-family: inherit;
		font-size: 0.7rem;
		letter-spacing: 0.03em;
		padding: 0.1rem 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.date-btn:hover {
		border-color: rgba(100, 150, 220, 0.4);
		background: rgba(60, 70, 90, 0.4);
	}

	.date-picker {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.date-input {
		background: rgba(20, 25, 35, 0.9);
		border: 1px solid rgba(100, 150, 220, 0.4);
		border-radius: 3px;
		color: #e0e8f0;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.2rem 0.3rem;
		outline: none;
		color-scheme: dark;
	}

	.date-input:focus {
		border-color: rgba(100, 150, 220, 0.7);
	}

	.date-actions {
		display: flex;
		gap: 2px;
	}

	.go-btn {
		color: #80c0ff;
	}

	.cancel-btn {
		color: #708090;
	}

	.time-row {
		display: flex;
		gap: 2px;
		flex-wrap: wrap;
	}

	.time-btn {
		background: rgba(60, 70, 90, 0.4);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		color: #6a7c8e;
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.15rem 0.35rem;
		cursor: pointer;
		transition: all 0.15s ease;
		min-width: 1.4rem;
		text-align: center;
	}

	.time-btn:hover {
		border-color: rgba(120, 140, 170, 0.5);
		color: #a0b0c0;
	}

	.time-btn.active {
		background: rgba(80, 120, 180, 0.25);
		border-color: rgba(100, 150, 220, 0.4);
		color: #b0c8e0;
	}

	.pause-btn {
		font-size: 0.7rem;
		padding: 0.1rem 0.3rem;
	}

	.reset-btn {
		margin-left: 2px;
		color: #708090;
	}

	.reset-btn:hover {
		color: #a0c0e0;
	}
</style>
