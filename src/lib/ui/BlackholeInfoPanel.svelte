<script lang="ts">
	import { fly } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { BlackholeNO } from '$lib/data/types';
	import { formatDistance } from '$lib/data/spectral-utils';
	import { schwarzschildRadiusKm } from '$lib/renderer/blackhole-renderer';
	import { formatDistanceAU } from './format-utils';
	import { blackholeLinks } from './external-links';
	import NasaImageSection from './NasaImageSection.svelte';
	import WikipediaSummarySection from './WikipediaSummarySection.svelte';

	interface Props {
		blackhole: BlackholeNO;
		onclose: () => void;
		onwarp?: () => void;
		onviewlightpath?: () => void;
		cameraDistance?: number | null;
		compact?: boolean;
		ontogglecompact?: () => void;
		loading?: boolean;
	}

	const { blackhole, onclose, onwarp, onviewlightpath, cameraDistance, compact = false, ontogglecompact, loading = false }: Props = $props();

	const rsKm = $derived(schwarzschildRadiusKm(blackhole.mass_solar));
	const links = $derived(blackholeLinks(blackhole));

	const SUBTYPE_LABELS: Record<string, string> = {
		stellar: 'Stellar',
		supermassive: 'Supermassive'
	};

	function formatMass(mass: number): string {
		if (mass >= 1_000_000) {
			return `${(mass / 1_000_000).toFixed(1)}M M\u2609`;
		}
		if (mass >= 1000) {
			return `${(mass / 1000).toFixed(1)}K M\u2609`;
		}
		return `${mass} M\u2609`;
	}

	function formatRadius(km: number): string {
		if (km >= 1_000_000) {
			return `${(km / 1_000_000).toFixed(1)}M km`;
		}
		if (km >= 1000) {
			return `${(km / 1000).toFixed(1)}K km`;
		}
		return `${km.toFixed(1)} km`;
	}
</script>

<div class="bh-info-panel" class:compact role="dialog" aria-label="Black hole information" transition:fly={{ x: 300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h2 class="bh-name">{blackhole.name}</h2>
		<div class="header-actions">
			{#if onviewlightpath}
				<button class="lightpath-btn" onclick={onviewlightpath} title="Trace light path from {blackhole.name} to Sol">Light</button>
			{/if}
			{#if onwarp}
				<button class="warp-btn" onclick={onwarp} title="Warp to {blackhole.name}">Warp</button>
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
			<span class="compact-type cat-{blackhole.subtype}">{SUBTYPE_LABELS[blackhole.subtype] ?? blackhole.subtype}</span>
			{#if cameraDistance != null}
				<span class="compact-dist">{formatDistanceAU(cameraDistance)}</span>
			{:else}
				<span class="compact-dist">{formatDistance(blackhole.dist_pc)}</span>
			{/if}
		</div>
	{:else}
		{#if blackhole.catalog_ids.length > 0}
			<div class="designation">
				{#each blackhole.catalog_ids as id}
					<span>{id}</span>
				{/each}
			</div>
		{/if}

		<div class="categories">
			<span class="cat-tag cat-{blackhole.subtype}">
				{SUBTYPE_LABELS[blackhole.subtype] ?? blackhole.subtype}
			</span>
		</div>

		<div class="stats">
			<div class="stat-row">
				<span class="stat-label">Mass</span>
				<span class="stat-value">{formatMass(blackhole.mass_solar)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Schwarzschild radius</span>
				<span class="stat-value">{formatRadius(rsKm)}</span>
			</div>

			{#if cameraDistance != null}
				<div class="stat-row">
					<span class="stat-label">From camera</span>
					<span class="stat-value">{formatDistanceAU(cameraDistance)}</span>
				</div>
			{/if}

			<div class="stat-row">
				<span class="stat-label">From Sol</span>
				<span class="stat-value">{formatDistance(blackhole.dist_pc)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Position (RA)</span>
				<span class="stat-value">{blackhole.ra.toFixed(2)}&deg;</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Position (Dec)</span>
				<span class="stat-value">{blackhole.dec >= 0 ? '+' : ''}{blackhole.dec.toFixed(2)}&deg;</span>
			</div>
		</div>

		{#if blackhole.description}
			<p class="description">{blackhole.description}</p>
		{/if}

		<NasaImageSection query="{blackhole.name} black hole" objectName={blackhole.name} />

		<WikipediaSummarySection objectName={blackhole.name} />

		<div class="external-links">
			{#each links as link}
				<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.bh-info-panel {
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
		border: 1px solid rgba(180, 100, 40, 0.25);
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
		border-bottom: 1px solid rgba(180, 100, 40, 0.15);
	}

	.bh-name {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 500;
		color: #e0c090;
		letter-spacing: 0.03em;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.3rem;
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

	.designation {
		padding: 0.2rem 0.7rem;
		color: #8090a0;
		font-size: 0.65rem;
		display: flex;
		gap: 0.5rem;
	}

	.categories {
		display: flex;
		gap: 4px;
		padding: 0.3rem 0.7rem;
		flex-wrap: wrap;
	}

	.cat-tag {
		font-size: 0.55rem;
		padding: 1px 6px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid;
	}

	.cat-supermassive {
		color: #f0a040;
		border-color: rgba(240, 160, 64, 0.3);
		background: rgba(240, 160, 64, 0.1);
	}

	.cat-stellar {
		color: #a080d0;
		border-color: rgba(160, 128, 208, 0.3);
		background: rgba(160, 128, 208, 0.1);
	}

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

	.stat-value {
		color: #c8d4e0;
		text-align: right;
	}

	.description {
		padding: 0.4rem 0.7rem;
		margin: 0;
		color: #9aa8b4;
		font-size: 0.65rem;
		line-height: 1.5;
		font-family: system-ui, sans-serif;
		border-top: 1px solid rgba(180, 100, 40, 0.1);
	}

	.external-links {
		display: flex;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem 0.5rem;
		border-top: 1px solid rgba(180, 100, 40, 0.1);
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

	.bh-info-panel.compact { width: auto; min-width: 200px; max-width: 320px; }

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
