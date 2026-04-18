<script lang="ts">
	import { fade } from 'svelte/transition';
	import {
		naifIdToHorizonsCommand,
		fetchHorizonsEphemeris,
		type HorizonsFetchStatus,
		type HorizonsStateVector
	} from '$lib/data/horizons';
	import { createApiCache, type ApiCache } from '$lib/data/api-cache';

	interface Props {
		naifId: number;
		bodyName: string;
		simDate?: string;
	}

	const { naifId, bodyName, simDate }: Props = $props();

	let status = $state<HorizonsFetchStatus>({ state: 'idle' });
	let cache = $state<ApiCache | null>(null);

	// Only show if we have a valid Horizons mapping
	const hasMapping = $derived(naifIdToHorizonsCommand(naifId) !== null);

	function formatAU(v: number): string {
		return v.toFixed(6) + ' AU';
	}

	function formatSpeed(auPerDay: number): string {
		// AU/day → km/s: 1 AU = 149_597_870.7 km, 1 day = 86400 s
		const kmPerSec = Math.abs(auPerDay) * 149_597_870.7 / 86400;
		return kmPerSec.toFixed(2) + ' km/s';
	}

	function formatSciNotation(v: number): string {
		if (Math.abs(v) < 0.001 || Math.abs(v) >= 10000) {
			return v.toExponential(4);
		}
		return v.toFixed(6);
	}

	function heliocentricDistance(vec: HorizonsStateVector): number {
		const { x, y, z } = vec.position;
		return Math.sqrt(x * x + y * y + z * z);
	}

	function orbitalSpeed(vec: HorizonsStateVector): number {
		const { vx, vy, vz } = vec.velocity;
		return Math.sqrt(vx * vx + vy * vy + vz * vz);
	}

	function timeAgo(fetchedAt: number): string {
		const seconds = Math.floor((Date.now() - fetchedAt) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h ago`;
	}

	async function doFetch() {
		status = { state: 'loading' };

		try {
			if (!cache) cache = await createApiCache();
			const date = simDate || new Date().toISOString();
			const result = await fetchHorizonsEphemeris(naifId, date, cache);
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
				message: err instanceof Error ? err.message : 'Failed to fetch JPL data'
			};
		}
	}
</script>

{#if hasMapping}
	<div class="horizons-section">
		{#if status.state === 'idle'}
			<button class="fetch-btn" onclick={doFetch}>
				Fetch JPL Ephemeris
			</button>
		{:else if status.state === 'loading'}
			<div class="skeleton">
				<div class="skel-bar skel-short"></div>
				<div class="skel-bar skel-full"></div>
				<div class="skel-bar skel-full"></div>
				<div class="skel-bar skel-med"></div>
			</div>
		{:else if status.state === 'error'}
			<div class="error-section">
				<span class="error-msg">{status.message}</span>
				<button class="retry-btn" onclick={doFetch}>Retry</button>
			</div>
		{:else if status.state === 'success'}
			{@const vec = status.data.vectors[0]}
			<div class="jpl-header" in:fade={{ duration: 200 }}>
				<span class="jpl-label">JPL Horizons</span>
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

			{#if vec}
				<div class="jpl-stats" in:fade={{ duration: 200, delay: 50 }}>
					<div class="stat-row">
						<span class="stat-label">Heliocentric dist.</span>
						<span class="stat-value">{formatAU(heliocentricDistance(vec))}</span>
					</div>

					<div class="stat-row">
						<span class="stat-label">Orbital speed</span>
						<span class="stat-value">{formatSpeed(orbitalSpeed(vec))}</span>
					</div>

					<div class="stat-row">
						<span class="stat-label">Position (AU)</span>
						<span class="stat-value vec">
							X {formatSciNotation(vec.position.x)}<br/>
							Y {formatSciNotation(vec.position.y)}<br/>
							Z {formatSciNotation(vec.position.z)}
						</span>
					</div>

					<div class="stat-row">
						<span class="stat-label">Velocity (AU/d)</span>
						<span class="stat-value vec">
							VX {formatSciNotation(vec.velocity.vx)}<br/>
							VY {formatSciNotation(vec.velocity.vy)}<br/>
							VZ {formatSciNotation(vec.velocity.vz)}
						</span>
					</div>

					<div class="stat-row">
						<span class="stat-label">Epoch</span>
						<span class="stat-value epoch">{vec.epoch}</span>
					</div>
				</div>
			{:else}
				<div class="no-data">No vector data returned for this epoch</div>
			{/if}

			<div class="jpl-source" in:fade={{ duration: 200, delay: 100 }}>Data from NASA JPL Horizons</div>
			<button class="refresh-btn" onclick={doFetch} in:fade={{ duration: 200, delay: 100 }}>Refresh</button>
		{/if}
	</div>
{/if}

<style>
	.horizons-section {
		border-top: 1px solid rgba(100, 120, 150, 0.15);
		padding: 0.4rem 0.7rem 0.5rem;
	}

	.fetch-btn {
		width: 100%;
		padding: 0.3rem 0;
		background: rgba(40, 80, 140, 0.2);
		border: 1px solid rgba(60, 100, 180, 0.3);
		border-radius: 3px;
		color: #6090c0;
		font-family: inherit;
		font-size: 0.6rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
	}

	.fetch-btn:hover {
		background: rgba(40, 80, 140, 0.35);
		color: #80b0e0;
		border-color: rgba(80, 130, 220, 0.5);
	}

	.jpl-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.3rem;
	}

	.jpl-label {
		font-size: 0.55rem;
		color: #80a0c0;
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

	.jpl-stats {
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
		font-size: 0.65rem;
	}

	.stat-value.vec {
		font-size: 0.58rem;
		line-height: 1.4;
		color: #a0b0c0;
	}

	.stat-value.epoch {
		font-size: 0.55rem;
		color: #8090a0;
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

	.jpl-source {
		margin-top: 0.3rem;
		font-size: 0.45rem;
		color: #405060;
		font-style: italic;
	}

	.no-data {
		color: #6a7c8e;
		font-size: 0.55rem;
		font-style: italic;
		padding: 0.2rem 0;
	}

	/* Loading skeleton (matches parent panel style) */
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
