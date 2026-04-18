<script lang="ts">
	import { fly } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { SolarSystemBody } from '$lib/data/types';
	import type { TransferPlan } from '$lib/renderer/transfer-orbit';
	import type { TransferFlightState } from './hud-state.svelte';

	interface Props {
		/** Planets and dwarf planets available for transfer. */
		bodies: SolarSystemBody[];
		/** Currently active transfer plan (null if none). */
		plan: TransferPlan | null;
		/** Current flight state. */
		flightState: TransferFlightState;
		/** Flight progress 0-1. */
		progress: number;
		/** Called when user requests a transfer computation. */
		oncompute: (departureId: number, arrivalId: number) => void;
		/** Called when user starts the fly-along. */
		onfly: () => void;
		/** Called to cancel/clear transfer. */
		onclear: () => void;
		/** Called to close the panel. */
		onclose: () => void;
	}

	const { bodies, plan, flightState, progress, oncompute, onfly, onclear, onclose }: Props = $props();

	let departureId = $state(3); // Earth
	let arrivalId = $state(4); // Mars

	function compute() {
		if (departureId === arrivalId) return;
		oncompute(departureId, arrivalId);
	}

	function formatDeltaV(ms: number): string {
		return `${(ms / 1000).toFixed(2)} km/s`;
	}

	function formatTime(seconds: number): string {
		const days = seconds / 86400;
		if (days > 365) return `${(days / 365.25).toFixed(1)} years`;
		return `${days.toFixed(1)} days`;
	}

	function formatPhaseAngle(rad: number): string {
		return `${(rad * 180 / Math.PI).toFixed(1)}\u00B0`;
	}

	// Filter to planets + dwarf planets only
	const transferBodies = $derived(
		bodies.filter(b => b.type === 'planet' || b.type === 'dwarf_planet')
			.sort((a, b) => a.naif_id - b.naif_id)
	);
</script>

<div class="transfer-panel" role="dialog" aria-label="Transfer orbit planner" transition:fly={{ x: -300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h2 class="panel-title">Hohmann Transfer</h2>
		<button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
	</div>

	{#if flightState !== 'flying'}
	<div class="body-selectors">
		<div class="selector">
			<label class="selector-label" for="transfer-departure">Departure</label>
			<select id="transfer-departure" class="selector-select" bind:value={departureId}>
				{#each transferBodies as body}
					<option value={body.naif_id} disabled={body.naif_id === arrivalId}>
						{body.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="swap-row">
			<button class="swap-btn" onclick={() => { const t = departureId; departureId = arrivalId; arrivalId = t; }} title="Swap departure and arrival">
				&#x21C5;
			</button>
		</div>
		<div class="selector">
			<label class="selector-label" for="transfer-arrival">Arrival</label>
			<select id="transfer-arrival" class="selector-select" bind:value={arrivalId}>
				{#each transferBodies as body}
					<option value={body.naif_id} disabled={body.naif_id === departureId}>
						{body.name}
					</option>
				{/each}
			</select>
		</div>
		<button class="compute-btn" onclick={compute} disabled={departureId === arrivalId}>
			Compute Transfer
		</button>
	</div>
	{/if}

	{#if plan}
	<div class="transfer-results">
		<div class="result-header">
			<span class="route">{plan.departureName} &rarr; {plan.arrivalName}</span>
		</div>
		<div class="stats">
			<div class="stat-row">
				<span class="stat-label">&Delta;V&#x2081; (departure)</span>
				<span class="stat-value">{formatDeltaV(plan.hohmann.delta_v1)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">&Delta;V&#x2082; (arrival)</span>
				<span class="stat-value">{formatDeltaV(plan.hohmann.delta_v2)}</span>
			</div>
			<div class="stat-row total">
				<span class="stat-label">Total &Delta;V</span>
				<span class="stat-value">{formatDeltaV(plan.hohmann.delta_v_total)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">Transfer time</span>
				<span class="stat-value">{formatTime(plan.hohmann.transfer_time)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">Phase angle</span>
				<span class="stat-value">{formatPhaseAngle(plan.hohmann.phase_angle)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">Window period</span>
				<span class="stat-value">{formatTime(plan.hohmann.synodic_period)}</span>
			</div>
		</div>

		{#if flightState === 'flying'}
		<div class="flight-status">
			<span class="flight-label">In transit</span>
			<div class="flight-progress-bar">
				<div class="flight-progress-fill" style="width: {progress * 100}%"></div>
			</div>
			<span class="flight-time">{formatTime(plan.hohmann.transfer_time * progress)} / {formatTime(plan.hohmann.transfer_time)}</span>
		</div>
		{:else if flightState === 'arrived'}
		<div class="flight-status arrived">
			<span class="flight-label">Arrived at {plan.arrivalName}</span>
		</div>
		{/if}

		<div class="actions">
			{#if flightState === 'idle' || flightState === 'planning'}
				<button class="fly-btn" onclick={onfly}>Fly Transfer</button>
			{/if}
			<button class="clear-btn" onclick={onclear}>
				{flightState === 'flying' ? 'Cancel' : 'Clear'}
			</button>
		</div>
	</div>
	{/if}
</div>

<style>
	.transfer-panel {
		position: fixed;
		top: 1rem;
		left: 1rem;
		width: 280px;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		background: rgba(10, 12, 20, 0.85);
		border: 1px solid rgba(240, 160, 48, 0.25);
		border-radius: 6px;
		backdrop-filter: blur(8px);
		z-index: 200;
		pointer-events: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.7rem 0.3rem;
		border-bottom: 1px solid rgba(240, 160, 48, 0.15);
	}

	.panel-title {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 500;
		color: #f0a030;
		letter-spacing: 0.05em;
	}

	.close-btn {
		background: none;
		border: none;
		color: #6a7c8e;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 0.2rem;
		line-height: 1;
		transition: color 0.15s;
	}
	.close-btn:hover { color: #b0c0d0; }

	.body-selectors {
		padding: 0.5rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.selector {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.selector-label {
		font-size: 0.6rem;
		color: #6a7c8e;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		min-width: 4.5rem;
	}

	.selector-select {
		flex: 1;
		background: rgba(30, 35, 50, 0.8);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		color: #c0c8d0;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.2rem 0.3rem;
		cursor: pointer;
	}
	.selector-select:focus {
		outline: none;
		border-color: rgba(240, 160, 48, 0.5);
	}

	.swap-row {
		display: flex;
		justify-content: center;
	}

	.swap-btn {
		background: rgba(60, 70, 90, 0.4);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		color: #6a7c8e;
		font-size: 0.8rem;
		padding: 0.1rem 0.5rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.swap-btn:hover { color: #a0b0c0; border-color: rgba(120, 140, 170, 0.5); }

	.compute-btn {
		background: rgba(240, 160, 48, 0.2);
		border: 1px solid rgba(240, 160, 48, 0.4);
		border-radius: 3px;
		color: #f0a030;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.3rem 0.5rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
		margin-top: 0.2rem;
	}
	.compute-btn:hover { background: rgba(240, 160, 48, 0.35); color: #ffc060; }
	.compute-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.transfer-results {
		padding: 0.4rem 0.7rem 0.5rem;
		border-top: 1px solid rgba(240, 160, 48, 0.1);
	}

	.result-header { margin-bottom: 0.3rem; }

	.route {
		font-size: 0.75rem;
		color: #e0c890;
		font-weight: 500;
	}

	.stats {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.stat-row.total {
		border-top: 1px solid rgba(100, 120, 150, 0.15);
		padding-top: 0.15rem;
		margin-top: 0.1rem;
	}

	.stat-label {
		color: #6a7c8e;
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.stat-value {
		color: #c8d4e0;
		text-align: right;
	}

	.flight-status {
		margin-top: 0.4rem;
		padding: 0.3rem 0;
		border-top: 1px solid rgba(100, 120, 150, 0.15);
	}

	.flight-label {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #f0a030;
	}

	.flight-status.arrived .flight-label {
		color: #40c080;
	}

	.flight-progress-bar {
		width: 100%;
		height: 3px;
		background: rgba(60, 80, 120, 0.4);
		border-radius: 2px;
		margin: 0.2rem 0;
		overflow: hidden;
	}

	.flight-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #40c080, #f0a030, #f06040);
		border-radius: 2px;
		transition: width 0.1s linear;
	}

	.flight-time {
		font-size: 0.55rem;
		color: #708090;
	}

	.actions {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.4rem;
	}

	.fly-btn {
		flex: 1;
		background: rgba(64, 192, 128, 0.2);
		border: 1px solid rgba(64, 192, 128, 0.4);
		border-radius: 3px;
		color: #40c080;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.3rem 0.5rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
	}
	.fly-btn:hover { background: rgba(64, 192, 128, 0.35); color: #60e0a0; }

	.clear-btn {
		background: rgba(100, 100, 120, 0.2);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		color: #708090;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.3rem 0.5rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
	}
	.clear-btn:hover { color: #a0b0c0; border-color: rgba(120, 140, 170, 0.5); }
</style>
