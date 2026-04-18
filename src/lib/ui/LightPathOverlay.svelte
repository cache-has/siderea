<script lang="ts">
	import { fly } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { LightPathInfo } from './hud-state.svelte';
	import { METERS_PER_AU } from '$lib/renderer/scale';

	interface Props {
		info: LightPathInfo;
		drawing: boolean;
		onclose: () => void;
	}

	const { info, drawing, onclose }: Props = $props();

	const C = 299_792_458; // m/s
	const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
	const LY_IN_METERS = C * SECONDS_PER_YEAR;

	function formatDistance(meters: number): string {
		const ly = meters / LY_IN_METERS;
		if (ly >= 1000) return `${(ly / 1000).toFixed(1)} kly`;
		if (ly >= 1) return `${ly.toFixed(2)} ly`;
		const au = meters / METERS_PER_AU;
		if (au >= 0.01) return `${au.toFixed(2)} AU`;
		return `${(meters / 1e3).toFixed(0)} km`;
	}

	function formatTime(seconds: number): string {
		const years = seconds / SECONDS_PER_YEAR;
		if (years >= 1000) return `${(years / 1000).toFixed(1)} kyr`;
		if (years >= 1) return `${years.toFixed(2)} years`;
		const days = seconds / 86400;
		if (days >= 1) return `${days.toFixed(1)} days`;
		const hours = seconds / 3600;
		if (hours >= 1) return `${hours.toFixed(1)} hours`;
		const mins = seconds / 60;
		if (mins >= 1) return `${mins.toFixed(1)} min`;
		return `${seconds.toFixed(1)} s`;
	}

	function formatAngle(radians: number): string {
		const arcsec = radians * (180 / Math.PI) * 3600;
		if (arcsec >= 3600) return `${(arcsec / 3600).toFixed(2)}\u00B0`;
		if (arcsec >= 60) return `${(arcsec / 60).toFixed(2)}\u2032`;
		if (arcsec >= 0.001) return `${arcsec.toFixed(3)}\u2033`;
		return `${(arcsec * 1000).toFixed(2)} mas`;
	}

	function formatApproach(meters: number): string {
		const au = meters / METERS_PER_AU;
		if (au >= 0.01) return `${au.toFixed(3)} AU`;
		const km = meters / 1e3;
		if (km >= 1) return `${km.toFixed(0)} km`;
		return `${meters.toFixed(0)} m`;
	}

	const deviation = $derived(() => {
		const { straight_line_distance, total_distance } = info.result;
		if (straight_line_distance <= 0) return 0;
		return ((total_distance - straight_line_distance) / straight_line_distance) * 100;
	});
</script>

<div class="lp-overlay" role="dialog" aria-label="Light path information" transition:fly={{ x: -300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h3 class="panel-title">Light Path</h3>
		<button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
	</div>

	<div class="source-label">
		{info.sourceName} &rarr; Sol
		{#if drawing}
			<span class="drawing-badge">tracing...</span>
		{/if}
	</div>

	<div class="stats">
		<div class="stat-row">
			<span class="stat-label">Path distance</span>
			<span class="stat-value">{formatDistance(info.result.total_distance)}</span>
		</div>
		<div class="stat-row">
			<span class="stat-label">Straight line</span>
			<span class="stat-value">{formatDistance(info.result.straight_line_distance)}</span>
		</div>
		<div class="stat-row">
			<span class="stat-label">Travel time</span>
			<span class="stat-value">{formatTime(info.result.travel_time)}</span>
		</div>
		<div class="stat-row">
			<span class="stat-label">Total deflection</span>
			<span class="stat-value">{formatAngle(info.result.total_deflection)}</span>
		</div>
		<div class="stat-row">
			<span class="stat-label">Path deviation</span>
			<span class="stat-value">{deviation().toExponential(2)}%</span>
		</div>
	</div>

	{#if info.result.deflections.length > 0}
		<div class="deflections-section">
			<h4 class="section-title">Deflection events</h4>
			{#each info.result.deflections as defl, i}
				<div class="deflection-row">
					<span class="defl-index">#{i + 1}</span>
					<div class="defl-details">
						<div class="defl-stat">
							<span class="stat-label">Angle</span>
							<span class="stat-value">{formatAngle(defl.deflection_angle)}</span>
						</div>
						<div class="defl-stat">
							<span class="stat-label">Closest approach</span>
							<span class="stat-value">{formatApproach(defl.closest_approach)}</span>
						</div>
						{#if defl.numerical}
							<span class="numerical-tag">numerical</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="hint">Press L to close</div>
</div>

<style>
	.lp-overlay {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		width: 280px;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		background: rgba(10, 12, 20, 0.88);
		border: 1px solid rgba(136, 204, 255, 0.2);
		border-radius: 6px;
		backdrop-filter: blur(8px);
		z-index: 200;
		pointer-events: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.6rem 0.3rem;
		border-bottom: 1px solid rgba(136, 204, 255, 0.1);
	}

	.panel-title {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 500;
		color: #88ccff;
		letter-spacing: 0.05em;
		text-transform: uppercase;
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

	.close-btn:hover {
		color: #b0c0d0;
	}

	.source-label {
		padding: 0.4rem 0.6rem;
		font-size: 0.72rem;
		color: #e0e8f0;
		border-bottom: 1px solid rgba(136, 204, 255, 0.06);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.drawing-badge {
		font-size: 0.55rem;
		padding: 1px 5px;
		border-radius: 3px;
		color: #88ccff;
		border: 1px solid rgba(136, 204, 255, 0.3);
		background: rgba(136, 204, 255, 0.1);
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	.stats {
		padding: 0.4rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.stat-label {
		color: #6a7c8e;
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.stat-value {
		color: #c8d4e0;
		text-align: right;
	}

	.deflections-section {
		padding: 0.3rem 0.6rem 0.4rem;
		border-top: 1px solid rgba(136, 204, 255, 0.08);
	}

	.section-title {
		margin: 0 0 0.3rem;
		font-size: 0.6rem;
		font-weight: 500;
		color: #ffcc44;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.deflection-row {
		display: flex;
		gap: 0.4rem;
		padding: 0.2rem 0;
		border-bottom: 1px solid rgba(100, 120, 150, 0.06);
	}

	.deflection-row:last-child {
		border-bottom: none;
	}

	.defl-index {
		color: #ffcc44;
		font-size: 0.6rem;
		min-width: 1.2rem;
		flex-shrink: 0;
	}

	.defl-details {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.defl-stat {
		display: flex;
		justify-content: space-between;
		gap: 0.3rem;
	}

	.numerical-tag {
		font-size: 0.5rem;
		padding: 0 4px;
		border-radius: 2px;
		color: #c090f0;
		border: 1px solid rgba(192, 144, 240, 0.25);
		background: rgba(192, 144, 240, 0.08);
		align-self: flex-start;
	}

	.hint {
		padding: 0.3rem 0.6rem;
		font-size: 0.55rem;
		color: #506070;
		text-align: center;
		border-top: 1px solid rgba(100, 120, 150, 0.06);
	}
</style>
