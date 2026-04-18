<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { SolarSystemBody } from '$lib/data/types';
	import { formatDistanceAU } from './format-utils';
	import { bodyLinks } from './external-links';
	import { focusTrap } from './focus-trap';
	import HorizonsEphemerisSection from './HorizonsEphemerisSection.svelte';
	import NasaImageSection from './NasaImageSection.svelte';
	import WikipediaSummarySection from './WikipediaSummarySection.svelte';

	interface Props {
		body: SolarSystemBody;
		onclose: () => void;
		onwarp?: () => void;
		onviewlightpath?: () => void;
		cameraDistance?: number | null;
		distanceFromSol?: number | null;
		compact?: boolean;
		ontogglecompact?: () => void;
		loading?: boolean;
		simDate?: string;
	}

	const { body, onclose, onwarp, onviewlightpath, cameraDistance, distanceFromSol, compact = false, ontogglecompact, loading = false, simDate }: Props = $props();

	const links = $derived(bodyLinks(body));

	const TYPE_LABELS: Record<string, string> = {
		star: 'Star',
		planet: 'Planet',
		dwarf_planet: 'Dwarf Planet',
		moon: 'Moon',
		comet: 'Comet',
		asteroid: 'Asteroid',
		kbo: 'Kuiper Belt Object'
	};

	function formatNumber(n: number, decimals = 1): string {
		if (n >= 1e12) return `${(n / 1e12).toFixed(decimals)} T`;
		if (n >= 1e9) return `${(n / 1e9).toFixed(decimals)} B`;
		if (n >= 1e6) return `${(n / 1e6).toFixed(decimals)} M`;
		if (n >= 1e3) return `${(n / 1e3).toFixed(decimals)} K`;
		return n.toFixed(decimals);
	}

	function formatRadius(km: number): string {
		if (km >= 10000) return `${(km / 1000).toFixed(1)} Mm`;
		return `${km.toLocaleString()} km`;
	}

	function formatPeriod(hours: number): string {
		const absHours = Math.abs(hours);
		if (absHours > 24 * 365) return `${(absHours / (24 * 365.25)).toFixed(2)} years`;
		if (absHours > 24) return `${(absHours / 24).toFixed(2)} days`;
		return `${absHours.toFixed(2)} hours`;
	}
</script>

<div class="body-info-panel" class:compact role="dialog" aria-label="Body information" transition:fly={{ x: 300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h2 class="body-name">{body.name}</h2>
		<div class="header-actions">
			{#if onviewlightpath}
				<button class="lightpath-btn" onclick={onviewlightpath} title="Trace light path from {body.name} to Sol">Light</button>
			{/if}
			{#if onwarp}
				<button class="warp-btn" onclick={onwarp} title="Warp to {body.name}">Warp</button>
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
			<span class="compact-type type-{body.type}">{TYPE_LABELS[body.type] ?? body.type}</span>
			{#if cameraDistance != null}
				<span class="compact-dist">{formatDistanceAU(cameraDistance)}</span>
			{:else if distanceFromSol != null}
				<span class="compact-dist">{formatDistanceAU(distanceFromSol)}</span>
			{/if}
		</div>
	{:else}
		<div class="body-type">
			<span class="type-tag type-{body.type}">{TYPE_LABELS[body.type] ?? body.type}</span>
			{#if body.parent_id}
				<span class="parent">orbits {body.parent_id}</span>
			{/if}
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
				<span class="stat-label">Radius</span>
				<span class="stat-value">{formatRadius(body.radius_km)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Mass</span>
				<span class="stat-value">{formatNumber(body.mass_kg)} kg</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Surface gravity</span>
				<span class="stat-value">{body.surface_gravity_m_s2.toFixed(2)} m/s<sup>2</sup></span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Axial tilt</span>
				<span class="stat-value">{body.axial_tilt_deg.toFixed(1)}&deg;</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Rotation period</span>
				<span class="stat-value">
					{formatPeriod(body.rotation_period_hours)}
					{#if body.rotation_period_hours < 0}<span class="stat-sub">(retrograde)</span>{/if}
				</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Orbital period</span>
				<span class="stat-value">{formatPeriod(body.orbital_period_days * 24)}</span>
			</div>

			{#if body.atmosphere}
				<div class="stat-row">
					<span class="stat-label">Atmosphere</span>
					<span class="stat-value">
						{#if body.atmosphere.surface_pressure_atm != null}
							{body.atmosphere.surface_pressure_atm.toFixed(body.atmosphere.surface_pressure_atm < 0.01 ? 6 : 2)} atm
						{:else}
							(no surface)
						{/if}
					</span>
				</div>
			{/if}

			{#if body.rings}
				<div class="stat-row">
					<span class="stat-label">Rings</span>
					<span class="stat-value">{formatRadius(body.rings.inner_radius_km)} &ndash; {formatRadius(body.rings.outer_radius_km)}</span>
				</div>
			{/if}
		</div>

		{#if body.description}
			<p class="description">{body.description}</p>
		{/if}

		{#if body.notable_features.length > 0}
			<ul class="features">
				{#each body.notable_features as feature}
					<li>{feature}</li>
				{/each}
			</ul>
		{/if}

		<NasaImageSection query={body.name} objectName={body.name} />

		<WikipediaSummarySection objectName={body.name} />

		<div class="external-links">
			{#each links as link}
				<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
			{/each}
		</div>

		{#if body.naif_id >= 0}
			<HorizonsEphemerisSection naifId={body.naif_id} bodyName={body.name} {simDate} />
		{/if}
	{/if}
</div>

<style>
	.body-info-panel {
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

	.body-name {
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

	.lightpath-btn {
		background: rgba(136, 204, 255, 0.15);
		border: 1px solid rgba(136, 204, 255, 0.3);
		border-radius: 3px;
		color: #88ccff;
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		transition: all 0.15s;
	}

	.lightpath-btn:hover {
		background: rgba(136, 204, 255, 0.3);
		color: #bbddff;
	}

	.body-type {
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
		border: 1px solid;
	}

	.type-planet { color: #70c0f0; border-color: rgba(112, 192, 240, 0.3); background: rgba(112, 192, 240, 0.1); }
	.type-dwarf_planet { color: #a0a0c0; border-color: rgba(160, 160, 192, 0.3); background: rgba(160, 160, 192, 0.1); }
	.type-moon { color: #c0c0a0; border-color: rgba(192, 192, 160, 0.3); background: rgba(192, 192, 160, 0.1); }
	.type-star { color: #f0d070; border-color: rgba(240, 208, 112, 0.3); background: rgba(240, 208, 112, 0.1); }
	.type-comet { color: #80e0c0; border-color: rgba(128, 224, 192, 0.3); background: rgba(128, 224, 192, 0.1); }
	.type-asteroid { color: #c0a080; border-color: rgba(192, 160, 128, 0.3); background: rgba(192, 160, 128, 0.1); }
	.type-kbo { color: #8090b0; border-color: rgba(128, 144, 176, 0.3); background: rgba(128, 144, 176, 0.1); }

	.parent { color: #6a7c8e; font-size: 0.6rem; }

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
	.stat-sub { color: #6a7c8e; font-size: 0.6rem; }

	.description {
		padding: 0.4rem 0.7rem;
		margin: 0;
		color: #9aa8b4;
		font-size: 0.65rem;
		line-height: 1.5;
		font-family: system-ui, sans-serif;
		border-top: 1px solid rgba(100, 120, 150, 0.1);
	}

	.features {
		padding: 0.2rem 0.7rem 0.5rem;
		margin: 0;
		list-style: none;
	}

	.features li {
		padding: 0.15rem 0;
		color: #8898a8;
		font-size: 0.6rem;
		font-family: system-ui, sans-serif;
		line-height: 1.4;
	}

	.features li::before { content: '\2022 '; color: #506070; }

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

	.body-info-panel.compact { width: auto; min-width: 200px; max-width: 320px; }

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
		border: 1px solid;
	}

	.compact-dist { color: #8090a0; font-size: 0.6rem; margin-left: auto; }

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
