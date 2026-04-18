<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { HudState } from './hud-state.svelte';
	import { CameraMode } from '$lib/renderer/camera-controller';
	import { WarpPhase } from '$lib/renderer/warp-controller';

	interface Props {
		state: HudState;
		ontoggleTransfer?: () => void;
	}

	const { state, ontoggleTransfer }: Props = $props();

	const MODE_LABELS: Record<CameraMode, string> = {
		[CameraMode.ORBIT]: 'Orbit',
		[CameraMode.FREE_FLY]: 'Free Fly',
		[CameraMode.FOLLOW]: 'Follow'
	};

	const WARP_PHASE_LABELS: Record<WarpPhase, string> = {
		[WarpPhase.IDLE]: '',
		[WarpPhase.ACCELERATING]: 'Accelerating',
		[WarpPhase.CRUISING]: 'Cruising',
		[WarpPhase.DECELERATING]: 'Decelerating'
	};

	/** Format distance in appropriate units. */
	function formatDistance(au: number): string {
		if (au < 0.001) {
			// Show in km (1 AU = 149,597,870.7 km)
			const km = au * 149_597_870.7;
			return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
		}
		if (au < 0.1) {
			return `${(au * 149_597_870.7 / 1e6).toFixed(3)} M km`;
		}
		if (au < 100) {
			return `${au.toFixed(3)} AU`;
		}
		return `${au.toFixed(1)} AU`;
	}
</script>

{#if state.hudVisible}
<div class="hud" role="toolbar" aria-label="Display controls" transition:fade={{ duration: 200 }}>
	<!-- Warp status overlay -->
	{#if state.isWarping}
	<div class="hud-section warp-status">
		<span class="warp-label">WARP</span>
		<span class="warp-phase">{WARP_PHASE_LABELS[state.warpPhase]}</span>
		{#if state.warpTargetName}
			<span class="warp-target">{state.warpTargetName}</span>
		{/if}
		<div class="warp-progress-bar">
			<div class="warp-progress-fill" style="width: {state.warpProgress * 100}%"></div>
		</div>
	</div>
	{/if}

	<!-- Camera mode + distance readout -->
	<div class="hud-section distance-readout">
		<span class="label">{state.isWarping ? 'Warp' : MODE_LABELS[state.cameraMode]}</span>
		<span class="value">{formatDistance(state.cameraDistance)}</span>
	</div>

	<!-- Size exaggeration toggle -->
	<div class="hud-section">
		<button
			class="toggle-btn"
			class:active={state.sizeMode === 'visible'}
			onclick={() => state.toggleSizeMode()}
			title="Toggle planet size exaggeration (real scale vs. visible)"
			aria-label="Toggle planet size exaggeration"
			aria-pressed={state.sizeMode === 'visible'}
		>
			{state.sizeMode === 'visible' ? 'Exaggerated' : 'Real Scale'}
		</button>
	</div>

	<!-- Orbit visibility -->
	<div class="hud-section">
		<span class="label">Orbits</span>
		<div class="toggle-group">
			<button
				class="toggle-sm"
				class:active={state.orbitVisibility.planets}
				onclick={() => state.toggleOrbitCategory('planets')}
				title="Toggle planet orbits"
				aria-label="Toggle planet orbits"
				aria-pressed={state.orbitVisibility.planets}
			>P</button>
			<button
				class="toggle-sm"
				class:active={state.orbitVisibility.dwarfPlanets}
				onclick={() => state.toggleOrbitCategory('dwarfPlanets')}
				title="Toggle dwarf planet orbits"
				aria-label="Toggle dwarf planet orbits"
				aria-pressed={state.orbitVisibility.dwarfPlanets}
			>D</button>
			<button
				class="toggle-sm"
				class:active={state.orbitVisibility.comets}
				onclick={() => state.toggleOrbitCategory('comets')}
				title="Toggle comet orbits"
				aria-label="Toggle comet orbits"
				aria-pressed={state.orbitVisibility.comets}
			>C</button>
			<button
				class="toggle-sm"
				class:active={state.orbitVisibility.smallBodies}
				onclick={() => state.toggleOrbitCategory('smallBodies')}
				title="Toggle small body orbits"
				aria-label="Toggle small body orbits"
				aria-pressed={state.orbitVisibility.smallBodies}
			>S</button>
			<button
				class="toggle-sm"
				class:active={state.orbitVisibility.moons}
				onclick={() => state.toggleOrbitCategory('moons')}
				title="Toggle moon orbits"
				aria-label="Toggle moon orbits"
				aria-pressed={state.orbitVisibility.moons}
			>M</button>
		</div>
	</div>

	<!-- Probe trajectory toggle -->
	<div class="hud-section">
		<button
			class="toggle-btn"
			class:active={state.probeTrajectoryVisible}
			onclick={() => state.toggleProbeTrajectories()}
			title="Toggle deep-space probe trajectory lines"
			aria-pressed={state.probeTrajectoryVisible}
		>
			Probe Trails
		</button>
	</div>

	<!-- Belt visibility -->
	<div class="hud-section">
		<span class="label">Belts</span>
		<div class="toggle-group">
			<button
				class="toggle-sm"
				class:active={state.beltVisibility.asteroidBelt}
				onclick={() => state.toggleBelt('asteroidBelt')}
				title="Toggle asteroid belt"
				aria-label="Toggle asteroid belt"
				aria-pressed={state.beltVisibility.asteroidBelt}
			>Ast</button>
			<button
				class="toggle-sm"
				class:active={state.beltVisibility.kuiperBelt}
				onclick={() => state.toggleBelt('kuiperBelt')}
				title="Toggle Kuiper belt"
				aria-label="Toggle Kuiper belt"
				aria-pressed={state.beltVisibility.kuiperBelt}
			>Kui</button>
		</div>
	</div>

	<!-- Transfer orbit planner toggle -->
	{#if ontoggleTransfer}
	<div class="hud-section">
		<button
			class="toggle-btn"
			class:active={state.transferPanelVisible}
			onclick={ontoggleTransfer}
			title="Open transfer orbit planner (T)"
			aria-pressed={state.transferPanelVisible}
		>
			Transfer
		</button>
	</div>
	{/if}

	<!-- Distance labels toggle -->
	<div class="hud-section">
		<button
			class="toggle-btn"
			class:active={state.distanceLabelsVisible}
			onclick={() => state.toggleDistanceLabels()}
			title="Toggle distance labels between objects"
			aria-pressed={state.distanceLabelsVisible}
		>
			Distances
		</button>
	</div>

	<!-- Light path toggle -->
	<div class="hud-section">
		<button
			class="toggle-btn"
			class:active={state.lightPathVisible}
			onclick={() => state.toggleLightPath()}
			title="Toggle light path visualization (L)"
			aria-pressed={state.lightPathVisible}
		>
			Light Paths
		</button>
	</div>

	<!-- Galactic overlays -->
	<div class="hud-section">
		<span class="label">Galaxy</span>
		<div class="toggle-group">
			<button
				class="toggle-sm"
				class:active={state.galacticVisibility.milkyWay}
				onclick={() => state.toggleGalactic('milkyWay')}
				title="Toggle Milky Way band / disk"
				aria-label="Toggle Milky Way"
				aria-pressed={state.galacticVisibility.milkyWay}
			>MW</button>
			<button
				class="toggle-sm"
				class:active={state.galacticVisibility.galacticPlane}
				onclick={() => state.toggleGalactic('galacticPlane')}
				title="Toggle galactic plane reference grid"
				aria-label="Toggle galactic plane"
				aria-pressed={state.galacticVisibility.galacticPlane}
			>Plane</button>
			<button
				class="toggle-sm"
				class:active={state.galacticVisibility.galacticCenter}
				onclick={() => state.toggleGalactic('galacticCenter')}
				title="Toggle galactic center indicator"
				aria-label="Toggle galactic center"
				aria-pressed={state.galacticVisibility.galacticCenter}
			>GC</button>
			<button
				class="toggle-sm"
				class:active={state.galacticVisibility.scaleMarkers}
				onclick={() => state.toggleGalactic('scaleMarkers')}
				title="Toggle distance scale markers"
				aria-label="Toggle scale markers"
				aria-pressed={state.galacticVisibility.scaleMarkers}
			>Dist</button>
			<button
				class="toggle-sm"
				class:active={state.galacticVisibility.constellations}
				onclick={() => state.toggleGalactic('constellations')}
				title="Toggle constellation lines (visible near Sol)"
				aria-label="Toggle constellations"
				aria-pressed={state.galacticVisibility.constellations}
			>Con</button>
		</div>
	</div>
</div>
{/if}

<style>
	.hud {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		pointer-events: auto;
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

	.distance-readout .value {
		font-size: 0.8rem;
		color: #e0e8f0;
		font-weight: 500;
		letter-spacing: 0.05em;
	}

	.label {
		opacity: 0.5;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.6rem;
		min-width: 3rem;
	}

	.toggle-group {
		display: flex;
		gap: 2px;
	}

	.toggle-btn {
		background: rgba(60, 70, 90, 0.4);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		color: #8090a0;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toggle-btn:hover {
		border-color: rgba(120, 140, 170, 0.5);
		color: #b0c0d0;
	}

	.toggle-btn.active {
		background: rgba(80, 120, 180, 0.3);
		border-color: rgba(100, 150, 220, 0.5);
		color: #c0d8f0;
	}

	.toggle-sm {
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

	.toggle-sm:hover {
		border-color: rgba(120, 140, 170, 0.5);
		color: #a0b0c0;
	}

	.toggle-sm.active {
		background: rgba(80, 120, 180, 0.25);
		border-color: rgba(100, 150, 220, 0.4);
		color: #b0c8e0;
	}

	/* Warp status */
	.warp-status {
		flex-direction: column;
		align-items: flex-start;
		border-color: rgba(100, 160, 255, 0.4);
		background: rgba(20, 30, 60, 0.8);
	}

	.warp-label {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		color: #80b0ff;
		text-transform: uppercase;
	}

	.warp-phase {
		font-size: 0.6rem;
		color: #90a8c0;
		opacity: 0.8;
	}

	.warp-target {
		font-size: 0.65rem;
		color: #c0d0e8;
	}

	.warp-progress-bar {
		width: 100%;
		height: 3px;
		background: rgba(60, 80, 120, 0.4);
		border-radius: 2px;
		margin-top: 0.2rem;
		overflow: hidden;
	}

	.warp-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4080d0, #80c0ff);
		border-radius: 2px;
		transition: width 0.1s linear;
	}
</style>
