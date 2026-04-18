<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { HudState } from './hud-state.svelte';
	import { CameraMode } from '$lib/renderer/camera-controller';

	interface Props {
		state: HudState;
	}

	const { state }: Props = $props();

	const AU_TO_KM = 149_597_870.7;

	/** Format distance in appropriate units. */
	function formatDistance(au: number): string {
		if (au < 0.001) {
			const km = au * AU_TO_KM;
			return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
		}
		if (au < 0.1) {
			return `${(au * AU_TO_KM / 1e6).toFixed(3)} M km`;
		}
		if (au < 100) {
			return `${au.toFixed(3)} AU`;
		}
		return `${au.toFixed(1)} AU`;
	}

	/** Format speed in appropriate units. */
	function formatSpeed(auPerSec: number): string {
		const kmPerSec = auPerSec * AU_TO_KM;
		if (kmPerSec < 1) {
			return `${(kmPerSec * 1000).toFixed(0)} m/s`;
		}
		if (kmPerSec < 1000) {
			return `${kmPerSec.toFixed(1)} km/s`;
		}
		if (kmPerSec < 1e6) {
			return `${(kmPerSec / 1000).toFixed(1)} Mm/s`;
		}
		// Show as fraction of c
		const c = 299_792.458; // km/s
		return `${(kmPerSec / c).toFixed(3)}c`;
	}

	/** Format angle in degrees with sign. */
	function formatAngle(rad: number): string {
		const deg = rad * (180 / Math.PI);
		const sign = deg >= 0 ? '+' : '';
		return `${sign}${deg.toFixed(1)}`;
	}

	/** Compass needle rotation for galactic center azimuth. */
	function compassRotation(rad: number): string {
		const deg = -rad * (180 / Math.PI); // negate for CSS rotation
		return `rotate(${deg.toFixed(1)}deg)`;
	}

	/** Format Right Ascension as HH:MM:SS.s */
	function formatRA(rad: number): string {
		const hours = (rad / (2 * Math.PI)) * 24;
		const h = Math.floor(hours);
		const m = Math.floor((hours - h) * 60);
		const s = ((hours - h) * 60 - m) * 60;
		return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toFixed(1).padStart(4, '0')}s`;
	}

	/** Format angle as ±DD°MM'SS" */
	function formatDMS(rad: number): string {
		const totalDeg = rad * (180 / Math.PI);
		const sign = totalDeg >= 0 ? '+' : '-';
		const absDeg = Math.abs(totalDeg);
		const d = Math.floor(absDeg);
		const m = Math.floor((absDeg - d) * 60);
		const s = ((absDeg - d) * 60 - m) * 60;
		return `${sign}${d.toString().padStart(2, '0')}° ${m.toString().padStart(2, '0')}' ${s.toFixed(0).padStart(2, '0')}"`;
	}

	/** Format angle as DDD.DD° */
	function formatDeg(rad: number): string {
		const deg = rad * (180 / Math.PI);
		return `${deg.toFixed(2)}°`;
	}
</script>

{#if state.hudVisible}
<div class="nav-hud" aria-label="Navigation information" transition:fade={{ duration: 200 }}>
	<!-- Nearest object indicator -->
	{#if state.nearestBodyName}
	<div class="hud-section nearest">
		<span class="label">Near</span>
		<span class="body-name">{state.nearestBodyName}</span>
		{#if state.nearestBodyDistance != null}
			<span class="body-dist">{formatDistance(state.nearestBodyDistance)}</span>
		{/if}
	</div>
	{/if}

	<!-- Velocity display (free-fly only) -->
	{#if state.cameraMode === CameraMode.FREE_FLY && state.cameraSpeed > 1e-8}
	<div class="hud-section velocity">
		<span class="label">Vel</span>
		<span class="value">{formatSpeed(state.cameraSpeed)}</span>
	</div>
	{/if}

	<!-- Coordinate display (toggled with C key) -->
	{#if state.coordinateDisplayVisible}
	<div class="hud-section coords">
		<div class="coord-system">
			<span class="coord-label">Equatorial</span>
			<div class="coord-row">
				<span class="coord-key">RA</span>
				<span class="coord-val">{formatRA(state.coordinates.ra)}</span>
			</div>
			<div class="coord-row">
				<span class="coord-key">Dec</span>
				<span class="coord-val">{formatDMS(state.coordinates.dec)}</span>
			</div>
		</div>
		<div class="coord-system">
			<span class="coord-label">Galactic</span>
			<div class="coord-row">
				<span class="coord-key">l</span>
				<span class="coord-val">{formatDeg(state.coordinates.galLon)}</span>
			</div>
			<div class="coord-row">
				<span class="coord-key">b</span>
				<span class="coord-val">{formatDMS(state.coordinates.galLat)}</span>
			</div>
		</div>
		<div class="coord-system">
			<span class="coord-label">Ecliptic</span>
			<div class="coord-row">
				<span class="coord-key">λ</span>
				<span class="coord-val">{formatDeg(state.coordinates.eclLon)}</span>
			</div>
			<div class="coord-row">
				<span class="coord-key">β</span>
				<span class="coord-val">{formatDMS(state.coordinates.eclLat)}</span>
			</div>
		</div>
	</div>
	{/if}

	<!-- Compass / orientation indicator -->
	<div class="hud-section compass">
		<div class="compass-rose">
			<!-- Compass ring -->
			<svg viewBox="-50 -50 100 100" class="compass-svg">
				<!-- Outer ring -->
				<circle cx="0" cy="0" r="42" fill="none" stroke="rgba(100,120,150,0.3)" stroke-width="1" />
				<!-- Tick marks at 90-degree intervals -->
				{#each [0, 90, 180, 270] as angle}
					<line
						x1={38 * Math.sin(angle * Math.PI / 180)}
						y1={-38 * Math.cos(angle * Math.PI / 180)}
						x2={42 * Math.sin(angle * Math.PI / 180)}
						y2={-42 * Math.cos(angle * Math.PI / 180)}
						stroke="rgba(100,120,150,0.5)"
						stroke-width="1"
					/>
				{/each}
				<!-- Galactic center needle -->
				<g style="transform: {compassRotation(state.compassHeading.galacticCenterAz)}; transform-origin: center;">
					<line x1="0" y1="0" x2="0" y2="-34" stroke="#80b0ff" stroke-width="2" stroke-linecap="round" opacity="0.8" />
					<polygon points="0,-38 -3,-30 3,-30" fill="#80b0ff" opacity="0.8" />
				</g>
				<!-- Center dot -->
				<circle cx="0" cy="0" r="2" fill="rgba(200,210,230,0.6)" />
			</svg>
			<span class="compass-label gc">GC</span>
		</div>
		<div class="compass-readings">
			<div class="reading">
				<span class="reading-label">Gal N</span>
				<span class="reading-value">{formatAngle(state.compassHeading.galacticNorthAlt)}</span>
			</div>
			<div class="reading">
				<span class="reading-label">Ecl N</span>
				<span class="reading-value">{formatAngle(state.compassHeading.eclipticNorthAlt)}</span>
			</div>
		</div>
	</div>
</div>
{/if}

<style>
	.nav-hud {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		pointer-events: none;
		z-index: 100;
	}

	.hud-section {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: rgba(10, 12, 20, 0.7);
		border: 1px solid rgba(100, 120, 150, 0.2);
		border-radius: 4px;
		padding: 0.3rem 0.5rem;
		backdrop-filter: blur(4px);
	}

	.label {
		opacity: 0.5;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.6rem;
		min-width: 2rem;
	}

	.body-name {
		color: #b0c8e0;
		font-weight: 500;
		font-size: 0.75rem;
	}

	.body-dist {
		opacity: 0.6;
		font-size: 0.65rem;
	}

	.velocity .value {
		font-size: 0.8rem;
		color: #e0e8f0;
		font-weight: 500;
		letter-spacing: 0.05em;
	}

	.coords {
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
		padding: 0.4rem 0.5rem;
	}

	.coord-system {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.coord-label {
		font-size: 0.5rem;
		opacity: 0.4;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 1px;
	}

	.coord-row {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
	}

	.coord-key {
		font-size: 0.55rem;
		opacity: 0.5;
		min-width: 1.2rem;
		text-align: right;
		font-style: italic;
	}

	.coord-val {
		font-size: 0.65rem;
		color: #b0c8e0;
		letter-spacing: 0.03em;
		font-variant-numeric: tabular-nums;
	}

	.compass {
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.5rem;
	}

	.compass-rose {
		position: relative;
		width: 60px;
		height: 60px;
	}

	.compass-svg {
		width: 100%;
		height: 100%;
	}

	.compass-label {
		position: absolute;
		font-size: 0.5rem;
		opacity: 0.5;
		letter-spacing: 0.05em;
	}

	.compass-label.gc {
		top: 2px;
		left: 50%;
		transform: translateX(-50%);
		color: #80b0ff;
		opacity: 0.7;
	}

	.compass-readings {
		display: flex;
		gap: 0.6rem;
		width: 100%;
	}

	.reading {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.reading-label {
		font-size: 0.5rem;
		opacity: 0.4;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.reading-value {
		font-size: 0.65rem;
		color: #b0c0d0;
	}
</style>
