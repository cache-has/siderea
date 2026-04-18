<script lang="ts">
	import { fly } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { Satellite } from '$lib/data/types';
	import { formatDistanceAU } from './format-utils';
	import { satelliteLinks } from './external-links';
	import NasaImageSection from './NasaImageSection.svelte';
	import WikipediaSummarySection from './WikipediaSummarySection.svelte';
	import { getActiveTle } from '$lib/renderer/satellites';
	import { formatTleAge, isTleStale, tleEpochToJD } from '$lib/data/celestrak';

	interface Props {
		satellite: Satellite;
		onclose: () => void;
		onwarp?: () => void;
		cameraDistance?: number | null;
		distanceFromSol?: number | null;
		compact?: boolean;
		ontogglecompact?: () => void;
		loading?: boolean;
		tleFetchedAt?: number | null;
	}

	const { satellite, onclose, onwarp, cameraDistance, distanceFromSol, compact = false, ontogglecompact, loading = false, tleFetchedAt = null }: Props = $props();

	const tleInfo = $derived.by(() => {
		if (!satellite.norad_id || satellite.orbit_type !== 'tle') return null;
		const tle = getActiveTle(satellite.norad_id);
		if (!tle) return null;
		return {
			epochJd: tle.epochJd,
			stale: tleFetchedAt != null ? isTleStale(tleFetchedAt) : true,
			ageLabel: tleFetchedAt != null ? formatTleAge(tleFetchedAt) : 'baked snapshot'
		};
	});

	const links = $derived(satelliteLinks(satellite));

	const SUBTYPE_LABELS: Record<string, string> = {
		space_station: 'Space Station',
		telescope: 'Telescope',
		probe: 'Probe',
		constellation: 'Constellation',
		historical: 'Historical'
	};

	const ORBIT_LABELS: Record<string, string> = {
		tle: 'LEO/MEO/GEO (TLE)',
		heliocentric: 'Heliocentric',
		lagrange: 'Lagrange Point',
		surface_marker: 'Surface',
		historical_orbit: 'Historical'
	};
</script>

<div class="sat-info-panel" class:compact role="dialog" aria-label="Satellite information" transition:fly={{ x: 300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h2 class="sat-name">{satellite.name}</h2>
		<div class="header-actions">
			{#if onwarp}
				<button class="warp-btn" onclick={onwarp} title="Warp to {satellite.name}">Warp</button>
			{/if}
			{#if ontogglecompact}
				<button class="compact-btn" onclick={ontogglecompact} aria-label={compact ? 'Expand panel' : 'Minimize panel'}>{compact ? '\u25B4' : '\u25BE'}</button>
			{/if}
			<button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
		</div>
	</div>

	{#if loading}
		<div class="skeleton">
			<div class="skel-bar skel-short"></div>
			<div class="skel-bar skel-full"></div>
			<div class="skel-bar skel-full"></div>
			<div class="skel-bar skel-med"></div>
			<div class="skel-bar skel-full"></div>
		</div>
	{:else if compact}
		<div class="compact-summary">
			<span class="compact-type">{SUBTYPE_LABELS[satellite.subtype] ?? satellite.subtype}</span>
			{#if cameraDistance != null}
				<span class="compact-dist">{formatDistanceAU(cameraDistance)}</span>
			{:else if distanceFromSol != null}
				<span class="compact-dist">{formatDistanceAU(distanceFromSol)}</span>
			{/if}
		</div>
	{:else}
		<div class="sat-type">
			<span class="type-tag">{SUBTYPE_LABELS[satellite.subtype] ?? satellite.subtype}</span>
			<span class="orbit-type">{ORBIT_LABELS[satellite.orbit_type] ?? satellite.orbit_type}</span>
		</div>

		<div class="stats">
			{#if cameraDistance != null}
				<div class="stat-row">
					<span class="stat-label">From camera</span>
					<span class="stat-value">{formatDistanceAU(cameraDistance)}</span>
				</div>
			{/if}
			{#if distanceFromSol != null}
				<div class="stat-row">
					<span class="stat-label">From Sol</span>
					<span class="stat-value">{formatDistanceAU(distanceFromSol)}</span>
				</div>
			{/if}

			<div class="stat-row">
				<span class="stat-label">Launch</span>
				<span class="stat-value">{satellite.launch_date.slice(0, 10)}</span>
			</div>

			{#if satellite.mass_kg != null}
				<div class="stat-row">
					<span class="stat-label">Mass</span>
					<span class="stat-value">{satellite.mass_kg.toLocaleString()} kg</span>
				</div>
			{/if}

			{#if satellite.lagrange_point}
				<div class="stat-row">
					<span class="stat-label">Lagrange point</span>
					<span class="stat-value">{satellite.lagrange_point}</span>
				</div>
			{/if}

			{#if satellite.norad_id != null}
				<div class="stat-row">
					<span class="stat-label">NORAD ID</span>
					<span class="stat-value">{satellite.norad_id}</span>
				</div>
			{/if}

			{#if tleInfo}
				<div class="stat-row">
					<span class="stat-label">TLE Data</span>
					<span class="stat-value tle-age" class:stale={tleInfo.stale}>{tleInfo.ageLabel}</span>
				</div>
			{/if}

			{#each Object.entries(satellite.stats) as [key, value]}
				<div class="stat-row">
					<span class="stat-label">{key}</span>
					<span class="stat-value">{value}</span>
				</div>
			{/each}
		</div>

		{#if satellite.description}
			<p class="description">{satellite.description}</p>
		{/if}

		<NasaImageSection query="{satellite.name} spacecraft" objectName={satellite.name} />

		<WikipediaSummarySection objectName={satellite.name} />

		<div class="external-links">
			{#each links as link}
				<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.sat-info-panel {
		position: fixed;
		top: 1rem;
		right: 1rem;
		width: 320px;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		background: rgba(10, 12, 20, 0.85);
		border: 1px solid rgba(100, 120, 150, 0.25);
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
		border-bottom: 1px solid rgba(100, 120, 150, 0.15);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.sat-name {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 500;
		color: #e0e8f0;
		letter-spacing: 0.03em;
	}

	.close-btn, .compact-btn {
		background: none;
		border: none;
		color: #6a7c8e;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 0.2rem;
		line-height: 1;
		transition: color 0.15s;
	}

	.close-btn:hover, .compact-btn:hover { color: #b0c0d0; }
	.compact-btn { font-size: 0.9rem; }

	.warp-btn {
		background: rgba(60, 100, 180, 0.3);
		border: 1px solid rgba(80, 130, 220, 0.4);
		border-radius: 3px;
		color: #80b0e0;
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		transition: all 0.15s;
	}

	.warp-btn:hover {
		background: rgba(60, 100, 180, 0.5);
		color: #a0d0ff;
	}

	.sat-type {
		padding: 0.3rem 0.7rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.type-tag {
		font-size: 0.55rem;
		padding: 1px 6px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #80c0a0;
		border: 1px solid rgba(128, 192, 160, 0.3);
		background: rgba(128, 192, 160, 0.1);
	}

	.orbit-type { color: #6a7c8e; font-size: 0.6rem; }

	.stats {
		padding: 0.4rem 0.7rem;
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

	.stat-value { color: #c8d4e0; text-align: right; }

	.description {
		padding: 0.4rem 0.7rem;
		margin: 0;
		color: #9aa8b4;
		font-size: 0.65rem;
		line-height: 1.5;
		font-family: system-ui, sans-serif;
		border-top: 1px solid rgba(100, 120, 150, 0.1);
	}

	.external-links {
		display: flex;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem 0.5rem;
		border-top: 1px solid rgba(100, 120, 150, 0.1);
	}

	.external-links a {
		font-size: 0.55rem;
		padding: 2px 8px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #6090c0;
		border: 1px solid rgba(96, 144, 192, 0.25);
		background: rgba(96, 144, 192, 0.08);
		text-decoration: none;
		transition: all 0.15s;
	}

	.external-links a:hover {
		color: #90c0f0;
		border-color: rgba(144, 192, 240, 0.4);
		background: rgba(96, 144, 192, 0.15);
	}

	.sat-info-panel.compact { width: auto; min-width: 200px; max-width: 320px; }

	.compact-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.7rem 0.4rem;
	}

	.compact-type {
		font-size: 0.55rem;
		padding: 1px 6px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #80c0a0;
		border: 1px solid rgba(128, 192, 160, 0.3);
		background: rgba(128, 192, 160, 0.1);
	}

	.compact-dist { color: #8090a0; font-size: 0.6rem; margin-left: auto; }

	.tle-age { font-size: 0.6rem; }
	.tle-age.stale { color: #c0a060; }

	.skeleton {
		padding: 0.5rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.skel-bar {
		height: 0.6rem;
		border-radius: 3px;
		background: rgba(100, 120, 150, 0.15);
		animation: skel-pulse 1.5s ease-in-out infinite;
	}

	.skel-full { width: 100%; }
	.skel-med { width: 65%; }
	.skel-short { width: 40%; }

	@keyframes skel-pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}
</style>
