<script lang="ts">
	import { fade } from 'svelte/transition';
	import { fetchExoplanets } from '$lib/data/exoplanets';
	import type { ExoplanetFetchStatus } from '$lib/data/types';
	import { createApiCache, type ApiCache } from '$lib/data/api-cache';

	interface Props {
		/** Star name as it appears in Siderea. */
		starName: string;
	}

	const { starName }: Props = $props();

	let status = $state<ExoplanetFetchStatus>({ state: 'idle' });
	let cache = $state<ApiCache | null>(null);

	function timeAgo(fetchedAt: number): string {
		const seconds = Math.floor((Date.now() - fetchedAt) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function formatPeriod(days: number): string {
		if (days < 1) return `${(days * 24).toFixed(1)} hr`;
		if (days < 365) return `${days.toFixed(2)} d`;
		return `${(days / 365.25).toFixed(2)} yr`;
	}

	function formatMass(earthMasses: number): string {
		if (earthMasses > 50) return `${(earthMasses / 317.83).toFixed(2)} M_J`;
		return `${earthMasses.toFixed(2)} M_E`;
	}

	function formatRadius(earthRadii: number): string {
		if (earthRadii > 5) return `${(earthRadii / 11.209).toFixed(2)} R_J`;
		return `${earthRadii.toFixed(2)} R_E`;
	}

	async function doFetch() {
		status = { state: 'loading' };

		try {
			if (!cache) cache = await createApiCache();
			const result = await fetchExoplanets(starName, cache);
			if (!result) {
				status = { state: 'error', message: 'No confirmed exoplanets found' };
				return;
			}
			status = {
				state: 'success',
				data: result.data,
				fromCache: result.fromCache,
				fetchedAt: result.fetchedAt,
				stale: result.stale,
			};
		} catch (err) {
			status = {
				state: 'error',
				message: err instanceof Error ? err.message : 'Failed to fetch exoplanet data',
			};
		}
	}
</script>

<div class="exoplanet-section">
	{#if status.state === 'idle'}
		<button class="fetch-btn" onclick={doFetch}>
			Load Exoplanet Data
		</button>
	{:else if status.state === 'loading'}
		<div class="skeleton">
			<div class="skel-bar skel-short"></div>
			<div class="skel-bar skel-full"></div>
			<div class="skel-bar skel-med"></div>
		</div>
	{:else if status.state === 'error'}
		<div class="error-section">
			<span class="error-msg">{status.message}</span>
			<button class="retry-btn" onclick={doFetch}>Retry</button>
		</div>
	{:else if status.state === 'success'}
		<div class="exo-header" in:fade={{ duration: 200 }}>
			<span class="exo-label">Exoplanets ({status.data.planetCount})</span>
			<span class="cache-status">
				{#if status.stale}
					<span class="offline-badge">offline</span> cached {timeAgo(status.fetchedAt)}
				{:else if status.fromCache}
					cached {timeAgo(status.fetchedAt)}
				{:else}
					live
				{/if}
			</span>
		</div>

		<div class="planet-list" in:fade={{ duration: 200, delay: 50 }}>
			{#each status.data.planets as planet}
				<div class="planet-card">
					<div class="planet-name">{planet.name}</div>
					<div class="planet-stats">
						{#if planet.orbitalPeriodDays != null}
							<div class="ps-row">
								<span class="ps-label">Period</span>
								<span class="ps-value">{formatPeriod(planet.orbitalPeriodDays)}</span>
							</div>
						{/if}
						{#if planet.semiMajorAxisAU != null}
							<div class="ps-row">
								<span class="ps-label">Semi-major axis</span>
								<span class="ps-value">{planet.semiMajorAxisAU.toFixed(4)} AU</span>
							</div>
						{/if}
						{#if planet.massEarth != null}
							<div class="ps-row">
								<span class="ps-label">Mass</span>
								<span class="ps-value">{formatMass(planet.massEarth)}</span>
							</div>
						{/if}
						{#if planet.radiusEarth != null}
							<div class="ps-row">
								<span class="ps-label">Radius</span>
								<span class="ps-value">{formatRadius(planet.radiusEarth)}</span>
							</div>
						{/if}
						{#if planet.eccentricity != null}
							<div class="ps-row">
								<span class="ps-label">Eccentricity</span>
								<span class="ps-value">{planet.eccentricity.toFixed(4)}</span>
							</div>
						{/if}
						{#if planet.discoveryMethod}
							<div class="ps-row">
								<span class="ps-label">Discovery</span>
								<span class="ps-value">{planet.discoveryMethod}{#if planet.discoveryYear}, {planet.discoveryYear}{/if}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="exo-source" in:fade={{ duration: 200, delay: 100 }}>Data from NASA Exoplanet Archive</div>

		<button class="refresh-btn" onclick={doFetch} in:fade={{ duration: 200, delay: 100 }}>Refresh</button>
	{/if}
</div>

<style>
	.exoplanet-section {
		border-top: 1px solid rgba(100, 120, 150, 0.15);
		padding: 0.4rem 0.7rem 0.5rem;
	}

	.fetch-btn {
		width: 100%;
		padding: 0.3rem 0;
		background: rgba(40, 120, 80, 0.2);
		border: 1px solid rgba(60, 160, 100, 0.3);
		border-radius: 3px;
		color: #60b080;
		font-family: inherit;
		font-size: 0.6rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
	}

	.fetch-btn:hover {
		background: rgba(40, 120, 80, 0.35);
		color: #80d0a0;
		border-color: rgba(80, 180, 120, 0.5);
	}

	.exo-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.3rem;
	}

	.exo-label {
		font-size: 0.55rem;
		color: #80e0a0;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 500;
	}

	.cache-status {
		font-size: 0.5rem;
		color: #506070;
		font-style: italic;
	}

	.offline-badge {
		display: inline-block;
		padding: 0 0.25rem;
		border-radius: 2px;
		background: rgba(200, 160, 60, 0.2);
		border: 1px solid rgba(200, 160, 60, 0.35);
		color: #c0a040;
		font-size: 0.45rem;
		font-style: normal;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		vertical-align: middle;
		margin-right: 0.15rem;
	}

	.planet-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.planet-card {
		background: rgba(128, 224, 160, 0.04);
		border: 1px solid rgba(128, 224, 160, 0.12);
		border-radius: 4px;
		padding: 0.3rem 0.4rem;
	}

	.planet-name {
		font-size: 0.65rem;
		color: #c8e0d0;
		font-weight: 500;
		margin-bottom: 0.2rem;
	}

	.planet-stats {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.ps-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.4rem;
	}

	.ps-label {
		color: #506860;
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.ps-value {
		color: #a0c0b0;
		font-size: 0.6rem;
		text-align: right;
	}

	.exo-source {
		margin-top: 0.3rem;
		font-size: 0.45rem;
		color: #405050;
		font-style: italic;
	}

	.refresh-btn {
		margin-top: 0.3rem;
		width: 100%;
		padding: 0.2rem 0;
		background: none;
		border: 1px solid rgba(100, 120, 150, 0.15);
		border-radius: 3px;
		color: #506070;
		font-family: inherit;
		font-size: 0.5rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
	}

	.refresh-btn:hover {
		color: #8090a0;
		border-color: rgba(100, 120, 150, 0.3);
	}

	.error-section {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.3rem;
	}

	.error-msg {
		color: #c07060;
		font-size: 0.55rem;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.retry-btn {
		background: rgba(180, 80, 60, 0.15);
		border: 1px solid rgba(180, 80, 60, 0.3);
		border-radius: 3px;
		color: #c07060;
		font-family: inherit;
		font-size: 0.5rem;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.retry-btn:hover {
		background: rgba(180, 80, 60, 0.25);
		color: #e08070;
	}

	.skeleton {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.1rem 0;
	}

	.skel-bar {
		height: 0.5rem;
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
