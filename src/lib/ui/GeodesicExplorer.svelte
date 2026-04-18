<script lang="ts">
	import { fly } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { BlackholeNO } from '$lib/data/types';
	import type { ActiveGeodesicInfo, TrajectoryType } from '$lib/renderer/geodesic-explorer-renderer';
	import type { BlackHoleGeometryResult } from '$lib/renderer/light-path-renderer';
	import { METERS_PER_AU } from '$lib/renderer/scale';

	interface Props {
		blackhole: BlackholeNO;
		impactParam: number;
		activeInfo: ActiveGeodesicInfo | null;
		bhGeometry: BlackHoleGeometryResult | null;
		onclose: () => void;
		onimpactchange: (ratio: number) => void;
		onfantoggle: (visible: boolean) => void;
	}

	const { blackhole, impactParam, activeInfo, bhGeometry, onclose, onimpactchange, onfantoggle }: Props = $props();

	let fanVisible = $state(true);

	const TRAJ_LABELS: Record<TrajectoryType, string> = {
		capture: 'Capture',
		unstable_orbit: 'Unstable orbit',
		deflection: 'Deflection'
	};

	const TRAJ_COLORS: Record<TrajectoryType, string> = {
		capture: '#ff3030',
		unstable_orbit: '#ffaa20',
		deflection: '#40ccff'
	};

	function formatMeters(m: number): string {
		if (m >= METERS_PER_AU * 0.01) {
			return `${(m / METERS_PER_AU).toFixed(3)} AU`;
		}
		if (m >= 1e9) {
			return `${(m / 1e9).toFixed(1)} Gm`;
		}
		if (m >= 1e6) {
			return `${(m / 1e6).toFixed(1)} Mm`;
		}
		return `${(m / 1e3).toFixed(0)} km`;
	}

	function handleSlider(e: Event) {
		const val = parseFloat((e.target as HTMLInputElement).value);
		onimpactchange(val);
	}

	function handleFanToggle() {
		fanVisible = !fanVisible;
		onfantoggle(fanVisible);
	}
</script>

<div class="geodesic-panel" role="dialog" aria-label="Geodesic explorer" transition:fly={{ x: -300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h2 class="panel-title">Geodesic Explorer</h2>
		<button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
	</div>

	<div class="bh-label">{blackhole.name}</div>

	{#if bhGeometry}
		<div class="radii-section">
			<div class="section-label">Black hole radii</div>
			<div class="stat-row">
				<span class="stat-label">Event horizon (r<sub>s</sub>)</span>
				<span class="stat-value">{formatMeters(bhGeometry.schwarzschild_radius)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">Photon sphere (1.5 r<sub>s</sub>)</span>
				<span class="stat-value">{formatMeters(bhGeometry.photon_sphere_radius)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">ISCO (3 r<sub>s</sub>)</span>
				<span class="stat-value">{formatMeters(bhGeometry.isco_radius)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">Critical b</span>
				<span class="stat-value">{formatMeters(bhGeometry.critical_impact_parameter)}</span>
			</div>
		</div>
	{/if}

	<div class="slider-section">
		<div class="section-label">Impact parameter</div>
		<div class="slider-row">
			<input
				type="range"
				min="0.3"
				max="6.0"
				step="0.01"
				value={impactParam}
				oninput={handleSlider}
				class="impact-slider"
				aria-label="Impact parameter ratio"
			/>
		</div>
		<div class="slider-labels">
			<span>Capture</span>
			<span class="slider-value">{impactParam.toFixed(2)} b<sub>crit</sub></span>
			<span>Deflect</span>
		</div>
	</div>

	{#if activeInfo}
		<div class="active-section">
			<div class="section-label">Active geodesic</div>
			<div class="stat-row">
				<span class="stat-label">Trajectory</span>
				<span class="stat-value traj-type" style="color: {TRAJ_COLORS[activeInfo.trajectoryType]}">
					{TRAJ_LABELS[activeInfo.trajectoryType]}
				</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">b / r<sub>s</sub></span>
				<span class="stat-value">{activeInfo.impactParameterRs.toFixed(2)}</span>
			</div>
			{#if bhGeometry}
				<div class="stat-row">
					<span class="stat-label">Impact param</span>
					<span class="stat-value">{formatMeters(activeInfo.impactParameter)}</span>
				</div>
			{/if}
		</div>
	{/if}

	<div class="controls-section">
		<label class="toggle-row">
			<input type="checkbox" checked={fanVisible} onchange={handleFanToggle} />
			<span>Show geodesic fan</span>
		</label>
	</div>

	<div class="legend">
		<div class="legend-item">
			<span class="legend-swatch" style="background: #ff3030"></span>
			<span>Capture (b &lt; b<sub>crit</sub>)</span>
		</div>
		<div class="legend-item">
			<span class="legend-swatch" style="background: #ffaa20"></span>
			<span>Unstable orbit (b &approx; b<sub>crit</sub>)</span>
		</div>
		<div class="legend-item">
			<span class="legend-swatch" style="background: #40ccff"></span>
			<span>Deflection (b &gt; b<sub>crit</sub>)</span>
		</div>
	</div>

	<div class="hint">Press <kbd>G</kbd> to close</div>
</div>

<style>
	.geodesic-panel {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		width: 300px;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		background: rgba(10, 12, 20, 0.88);
		border: 1px solid rgba(64, 204, 255, 0.2);
		border-radius: 6px;
		backdrop-filter: blur(8px);
		z-index: 200;
		pointer-events: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.7rem 0.3rem;
		border-bottom: 1px solid rgba(64, 204, 255, 0.12);
	}

	.panel-title {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 500;
		color: #80d0ff;
		letter-spacing: 0.03em;
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

	.bh-label {
		padding: 0.2rem 0.7rem;
		color: #e0c090;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.section-label {
		color: #6890a8;
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.2rem;
	}

	.radii-section,
	.active-section,
	.controls-section {
		padding: 0.4rem 0.7rem;
		border-top: 1px solid rgba(64, 204, 255, 0.08);
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		padding: 1px 0;
	}

	.stat-label {
		color: #6a7c8e;
		font-size: 0.6rem;
		flex-shrink: 0;
	}

	.stat-value {
		color: #c8d4e0;
		text-align: right;
		font-size: 0.65rem;
	}

	.traj-type {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.slider-section {
		padding: 0.5rem 0.7rem;
		border-top: 1px solid rgba(64, 204, 255, 0.08);
	}

	.slider-row {
		padding: 0.2rem 0;
	}

	.impact-slider {
		width: 100%;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: linear-gradient(to right, #ff3030 0%, #ffaa20 17%, #40ccff 35%, #40ccff 100%);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}

	.impact-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #e0e8f0;
		border: 2px solid rgba(10, 12, 20, 0.6);
		cursor: pointer;
	}

	.impact-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #e0e8f0;
		border: 2px solid rgba(10, 12, 20, 0.6);
		cursor: pointer;
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.55rem;
		color: #6a7c8e;
		padding-top: 2px;
	}

	.slider-value {
		color: #a0b8c8;
		font-weight: 500;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-size: 0.65rem;
	}

	.toggle-row input {
		accent-color: #40ccff;
	}

	.legend {
		padding: 0.3rem 0.7rem;
		border-top: 1px solid rgba(64, 204, 255, 0.08);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.55rem;
		color: #8090a0;
	}

	.legend-swatch {
		display: inline-block;
		width: 10px;
		height: 3px;
		border-radius: 1px;
		flex-shrink: 0;
	}

	.hint {
		padding: 0.3rem 0.7rem;
		text-align: center;
		font-size: 0.5rem;
		color: #506070;
	}

	kbd {
		padding: 1px 4px;
		border: 1px solid #405060;
		border-radius: 2px;
		background: rgba(40, 50, 60, 0.5);
		font-size: 0.5rem;
	}
</style>
