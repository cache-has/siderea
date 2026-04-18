<script lang="ts">
	import { fly } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { ClusterNO, ClusterSubtype } from '$lib/data/types';
	import { formatDistance } from '$lib/data/spectral-utils';
	import { angularToPhysicalPc } from '$lib/renderer/nebula-renderer';
	import { formatDistanceAU } from './format-utils';
	import { clusterLinks } from './external-links';
	import NasaImageSection from './NasaImageSection.svelte';
	import WikipediaSummarySection from './WikipediaSummarySection.svelte';

	interface Props {
		cluster: ClusterNO;
		onclose: () => void;
		onwarp?: () => void;
		onviewlightpath?: () => void;
		cameraDistance?: number | null;
		compact?: boolean;
		ontogglecompact?: () => void;
		loading?: boolean;
	}

	const { cluster, onclose, onwarp, onviewlightpath, cameraDistance, compact = false, ontogglecompact, loading = false }: Props = $props();

	const physicalSizePc = $derived(angularToPhysicalPc(cluster.angular_size_arcmin, cluster.dist_pc));
	const physicalSizeLy = $derived(physicalSizePc * 3.26156);
	const links = $derived(clusterLinks(cluster));

	const SUBTYPE_LABELS: Record<ClusterSubtype, string> = {
		open: 'Open Cluster',
		globular: 'Globular Cluster'
	};

	function formatAngularSize(arcmin: number): string {
		if (arcmin >= 60) {
			return `${(arcmin / 60).toFixed(1)}\u00B0`;
		}
		return `${arcmin.toFixed(1)}\u2032`;
	}

	function formatPhysicalSize(ly: number): string {
		if (ly >= 1000) {
			return `${(ly / 1000).toFixed(1)}K ly`;
		}
		if (ly >= 1) {
			return `${ly.toFixed(1)} ly`;
		}
		return `${(ly * 365.25 * 24 * 63241).toFixed(0)} AU`;
	}

	function formatAge(ageMyr: number): string {
		if (ageMyr >= 1000) {
			return `${(ageMyr / 1000).toFixed(1)} Gyr`;
		}
		if (ageMyr >= 1) {
			return `${ageMyr.toFixed(0)} Myr`;
		}
		return `${(ageMyr * 1000).toFixed(0)} kyr`;
	}

	function formatStarCount(count: number): string {
		if (count >= 1_000_000) {
			return `~${(count / 1_000_000).toFixed(0)}M`;
		}
		if (count >= 1000) {
			return `~${(count / 1000).toFixed(0)}K`;
		}
		return `~${count}`;
	}
</script>

<div class="cluster-info-panel" class:compact role="dialog" aria-label="Star cluster information" transition:fly={{ x: 300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h2 class="cluster-name">{cluster.name}</h2>
		<div class="header-actions">
			{#if onviewlightpath}
				<button class="lightpath-btn" onclick={onviewlightpath} title="Trace light path from {cluster.name} to Sol">Light</button>
			{/if}
			{#if onwarp}
				<button class="warp-btn" onclick={onwarp} title="Warp to {cluster.name}">Warp</button>
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
			<span class="compact-type cat-{cluster.subtype}">{SUBTYPE_LABELS[cluster.subtype] ?? cluster.subtype}</span>
			{#if cameraDistance != null}
				<span class="compact-dist">{formatDistanceAU(cameraDistance)}</span>
			{:else}
				<span class="compact-dist">{formatDistance(cluster.dist_pc)}</span>
			{/if}
		</div>
	{:else}
		{#if cluster.catalog_ids.length > 0}
			<div class="designation">
				{#each cluster.catalog_ids as id}
					<span>{id}</span>
				{/each}
			</div>
		{/if}

		<div class="categories">
			<span class="cat-tag cat-{cluster.subtype}">
				{SUBTYPE_LABELS[cluster.subtype] ?? cluster.subtype}
			</span>
		</div>

		<div class="stats">
			<div class="stat-row">
				<span class="stat-label">Type</span>
				<span class="stat-value">{SUBTYPE_LABELS[cluster.subtype] ?? cluster.subtype}</span>
			</div>

			{#if cameraDistance != null}
				<div class="stat-row">
					<span class="stat-label">From camera</span>
					<span class="stat-value">{formatDistanceAU(cameraDistance)}</span>
				</div>
			{/if}

			<div class="stat-row">
				<span class="stat-label">From Sol</span>
				<span class="stat-value">{formatDistance(cluster.dist_pc)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Angular size</span>
				<span class="stat-value">{formatAngularSize(cluster.angular_size_arcmin)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Physical size</span>
				<span class="stat-value">{formatPhysicalSize(physicalSizeLy)}</span>
			</div>

			{#if cluster.star_count != null}
				<div class="stat-row">
					<span class="stat-label">Stars</span>
					<span class="stat-value">{formatStarCount(cluster.star_count)}</span>
				</div>
			{/if}

			{#if cluster.age_myr != null}
				<div class="stat-row">
					<span class="stat-label">Age</span>
					<span class="stat-value">{formatAge(cluster.age_myr)}</span>
				</div>
			{/if}

			{#if cluster.metallicity_fe_h != null}
				<div class="stat-row">
					<span class="stat-label">[Fe/H]</span>
					<span class="stat-value">{cluster.metallicity_fe_h.toFixed(2)}</span>
				</div>
			{/if}

			<div class="stat-row">
				<span class="stat-label">Position (RA)</span>
				<span class="stat-value">{cluster.ra.toFixed(2)}&deg;</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Position (Dec)</span>
				<span class="stat-value">{cluster.dec >= 0 ? '+' : ''}{cluster.dec.toFixed(2)}&deg;</span>
			</div>
		</div>

		{#if cluster.description}
			<p class="description">{cluster.description}</p>
		{/if}

		<NasaImageSection query={cluster.name} objectName={cluster.name} />

		<WikipediaSummarySection objectName={cluster.name} />

		<div class="external-links">
			{#each links as link}
				<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.cluster-info-panel {
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
		border: 1px solid rgba(180, 160, 80, 0.25);
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
		border-bottom: 1px solid rgba(180, 160, 80, 0.15);
	}

	.cluster-name {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 500;
		color: #e0c870;
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

	.cat-open {
		color: #e0b860;
		border-color: rgba(224, 184, 96, 0.3);
		background: rgba(224, 184, 96, 0.1);
	}

	.cat-globular {
		color: #a0a0e0;
		border-color: rgba(160, 160, 224, 0.3);
		background: rgba(160, 160, 224, 0.1);
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
		border-top: 1px solid rgba(180, 160, 80, 0.1);
	}

	.external-links {
		display: flex;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem 0.5rem;
		border-top: 1px solid rgba(180, 160, 80, 0.1);
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

	.cluster-info-panel.compact { width: auto; min-width: 200px; max-width: 320px; }

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
