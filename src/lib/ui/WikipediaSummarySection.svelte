<script lang="ts">
	import { fade } from 'svelte/transition';
	import { fetchWikipediaSummary, type WikipediaFetchStatus } from '$lib/data/wikipedia';
	import { createApiCache, type ApiCache } from '$lib/data/api-cache';

	interface Props {
		/** Object name to look up on Wikipedia (e.g. "Jupiter", "Orion Nebula"). */
		objectName: string;
	}

	const { objectName }: Props = $props();

	let status = $state<WikipediaFetchStatus>({ state: 'idle' });
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

	async function doFetch() {
		status = { state: 'loading' };

		try {
			if (!cache) cache = await createApiCache();
			const result = await fetchWikipediaSummary(objectName, cache);
			if (!result) {
				status = { state: 'error', message: 'No Wikipedia article found' };
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
				message: err instanceof Error ? err.message : 'Failed to fetch Wikipedia summary',
			};
		}
	}
</script>

<div class="wiki-section">
	{#if status.state === 'idle'}
		<button class="fetch-btn" onclick={doFetch}>
			Load Wikipedia Summary
		</button>
	{:else if status.state === 'loading'}
		<div class="skeleton">
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
		<div class="wiki-header" in:fade={{ duration: 200 }}>
			<span class="wiki-label">Wikipedia</span>
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

		<p class="wiki-extract" in:fade={{ duration: 200, delay: 50 }}>{status.data.extract}</p>

		<div class="wiki-footer" in:fade={{ duration: 200, delay: 100 }}>
			<a
				href={status.data.articleUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="wiki-link"
			>
				Read full article
			</a>
			<button class="refresh-btn" onclick={doFetch}>Refresh</button>
		</div>
	{/if}
</div>

<style>
	.wiki-section {
		border-top: 1px solid rgba(100, 120, 150, 0.15);
		padding: 0.4rem 0.7rem 0.5rem;
	}

	.fetch-btn {
		width: 100%;
		padding: 0.3rem 0;
		background: rgba(60, 80, 140, 0.2);
		border: 1px solid rgba(80, 110, 180, 0.3);
		border-radius: 3px;
		color: #7090c0;
		font-family: inherit;
		font-size: 0.6rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
	}

	.fetch-btn:hover {
		background: rgba(60, 80, 140, 0.35);
		color: #90b0e0;
		border-color: rgba(100, 140, 220, 0.5);
	}

	.wiki-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.3rem;
	}

	.wiki-label {
		font-size: 0.55rem;
		color: #7090c0;
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

	.wiki-extract {
		margin: 0;
		color: #9aa8b4;
		font-size: 0.65rem;
		line-height: 1.5;
		font-family: system-ui, sans-serif;
	}

	.wiki-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.3rem;
	}

	.wiki-link {
		font-size: 0.55rem;
		padding: 2px 8px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #7090c0;
		border: 1px solid rgba(112, 144, 192, 0.25);
		background: rgba(112, 144, 192, 0.08);
		text-decoration: none;
		transition: all 0.15s;
	}

	.wiki-link:hover {
		color: #90b0e0;
		border-color: rgba(144, 176, 224, 0.4);
		background: rgba(112, 144, 192, 0.15);
	}

	.refresh-btn {
		background: none;
		border: 1px solid rgba(100, 120, 150, 0.15);
		border-radius: 3px;
		color: #506070;
		font-family: inherit;
		font-size: 0.5rem;
		padding: 0.15rem 0.4rem;
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

	@keyframes skel-pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}
</style>
