<script lang="ts">
	import { fly } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { NotableStar } from '$lib/data/types';
	import {
		parseSpectralType,
		estimateStellarProperties,
		bvToTemperature,
		formatDistance
	} from '$lib/data/spectral-utils';
	import { formatDistanceAU } from './format-utils';
	import { starLinks } from './external-links';
	import NasaImageSection from './NasaImageSection.svelte';
	import ExoplanetSection from './ExoplanetSection.svelte';
	import WikipediaSummarySection from './WikipediaSummarySection.svelte';

	interface Props {
		star: NotableStar;
		onclose: () => void;
		onwarp?: () => void;
		onviewlightpath?: () => void;
		cameraDistance?: number | null;
		compact?: boolean;
		ontogglecompact?: () => void;
		loading?: boolean;
	}

	const { star, onclose, onwarp, onviewlightpath, cameraDistance, compact = false, ontogglecompact, loading = false }: Props = $props();

	const spectralInfo = $derived(parseSpectralType(star.spectral));
	const estimates = $derived(estimateStellarProperties(star.spectral));
	const temperature = $derived(
		bvToTemperature(star.bv)
	);

	const links = $derived(starLinks(star));
	const isExoplanetHost = $derived(star.categories?.includes('exoplanet_host') ?? false);

	const CATEGORY_LABELS: Record<string, string> = {
		brightest: 'Brightest',
		nearest: 'Nearest',
		scientific: 'Scientific',
		exoplanet_host: 'Exoplanet Host'
	};

	function formatMag(mag: number): string {
		return mag >= 0 ? `+${mag.toFixed(2)}` : mag.toFixed(2);
	}
</script>

<div class="star-info-panel" class:compact role="dialog" aria-label="Star information" transition:fly={{ x: 300, duration: 250 }} use:focusTrap={{ onclose }}>
	<div class="panel-header">
		<h2 class="star-name">{star.name}</h2>
		<div class="header-actions">
			{#if onviewlightpath}
				<button class="lightpath-btn" onclick={onviewlightpath} title="Trace light path from {star.name} to Sol">Light</button>
			{/if}
			{#if onwarp}
				<button class="warp-btn" onclick={onwarp} title="Warp to {star.name}">Warp</button>
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
			<span class="compact-type">{star.spectral || 'Star'}</span>
			{#if cameraDistance != null}
				<span class="compact-dist">{formatDistanceAU(cameraDistance)}</span>
			{:else}
				<span class="compact-dist">{formatDistance(star.dist)}</span>
			{/if}
		</div>
	{:else}
		{#if star.bayer || star.constellation}
			<div class="designation">
				{#if star.bayer}<span>{star.bayer}</span>{/if}
				{#if star.constellation}<span class="constellation">{star.constellation}</span>{/if}
			</div>
		{/if}

		{#if star.categories && star.categories.length > 0}
			<div class="categories">
				{#each star.categories as cat}
					<span class="cat-tag cat-{cat}">{CATEGORY_LABELS[cat] ?? cat}</span>
				{/each}
			</div>
		{/if}

		<div class="stats">
			<div class="stat-row">
				<span class="stat-label">Spectral type</span>
				<span class="stat-value">
					{star.spectral || '?'}
					{#if spectralInfo}
						<span class="stat-sub">({spectralInfo.luminosityLabel})</span>
					{/if}
				</span>
			</div>

			{#if cameraDistance != null}
				<div class="stat-row">
					<span class="stat-label">From camera</span>
					<span class="stat-value">{formatDistanceAU(cameraDistance)}</span>
				</div>
			{/if}

			<div class="stat-row">
				<span class="stat-label">From Sol</span>
				<span class="stat-value">{formatDistance(star.dist)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">App. magnitude</span>
				<span class="stat-value">{formatMag(star.mag)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Abs. magnitude</span>
				<span class="stat-value">{formatMag(star.absmag)}</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Temperature</span>
				<span class="stat-value">{temperature.toLocaleString()} K</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Mass</span>
				<span class="stat-value">
					{#if star.mass_solar != null}
						{star.mass_solar} M<sub>&#9737;</sub>
					{:else if estimates}
						~{estimates.mass_solar} M<sub>&#9737;</sub>
						<span class="stat-sub">(est.)</span>
					{:else}
						?
					{/if}
				</span>
			</div>

			<div class="stat-row">
				<span class="stat-label">Radius</span>
				<span class="stat-value">
					{#if star.radius_solar != null}
						{star.radius_solar} R<sub>&#9737;</sub>
					{:else if estimates}
						~{estimates.radius_solar} R<sub>&#9737;</sub>
						<span class="stat-sub">(est.)</span>
					{:else}
						?
					{/if}
				</span>
			</div>

			{#if star.hip}
				<div class="stat-row">
					<span class="stat-label">Hipparcos</span>
					<span class="stat-value">HIP {star.hip}</span>
				</div>
			{/if}
		</div>

		{#if star.description}
			<p class="description">{star.description}</p>
		{/if}

		{#if star.notable_features && star.notable_features.length > 0}
			<ul class="features">
				{#each star.notable_features as feature}
					<li>{feature}</li>
				{/each}
			</ul>
		{/if}

		{#if isExoplanetHost}
			<ExoplanetSection starName={star.name} />
		{/if}

		<NasaImageSection query="{star.name} star" objectName={star.name} />

		<WikipediaSummarySection objectName={star.name} />

		<div class="external-links">
			{#each links as link}
				<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.star-info-panel {
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

	.star-name {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 500;
		color: #e0e8f0;
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

	.close-btn:hover, .compact-btn:hover {
		color: #b0c0d0;
	}

	.compact-btn {
		font-size: 0.9rem;
	}

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

	.constellation {
		opacity: 0.6;
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

	.cat-brightest {
		color: #f0d070;
		border-color: rgba(240, 208, 112, 0.3);
		background: rgba(240, 208, 112, 0.1);
	}

	.cat-nearest {
		color: #70c0f0;
		border-color: rgba(112, 192, 240, 0.3);
		background: rgba(112, 192, 240, 0.1);
	}

	.cat-scientific {
		color: #c090f0;
		border-color: rgba(192, 144, 240, 0.3);
		background: rgba(192, 144, 240, 0.1);
	}

	.cat-exoplanet_host {
		color: #80e0a0;
		border-color: rgba(128, 224, 160, 0.3);
		background: rgba(128, 224, 160, 0.1);
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

	.stat-sub {
		color: #6a7c8e;
		font-size: 0.6rem;
	}

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

	.features li::before {
		content: '\2022 ';
		color: #506070;
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

	/* Compact mode */
	.star-info-panel.compact {
		width: auto;
		min-width: 200px;
		max-width: 320px;
	}

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
		color: #f0d070;
		border: 1px solid rgba(240, 208, 112, 0.3);
		background: rgba(240, 208, 112, 0.1);
	}

	.compact-dist {
		color: #8090a0;
		font-size: 0.6rem;
		margin-left: auto;
	}

	/* Loading skeleton */
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
