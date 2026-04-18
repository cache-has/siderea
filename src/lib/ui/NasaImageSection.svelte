<script lang="ts">
	import { fade } from 'svelte/transition';
	import { fetchNasaImage, type NasaImageFetchStatus } from '$lib/data/nasa-images';
	import { createApiCache, type ApiCache } from '$lib/data/api-cache';

	interface Props {
		/** Search query for NASA Images API (object name, e.g. "Jupiter"). */
		query: string;
		/** Display name for alt text. */
		objectName: string;
	}

	const { query, objectName }: Props = $props();

	let status = $state<NasaImageFetchStatus>({ state: 'idle' });
	let cache = $state<ApiCache | null>(null);
	let thumbLoaded = $state(false);

	// Reset loaded state when query changes (new object selected)
	$effect(() => {
		query; // track dependency
		thumbLoaded = false;
	});

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
			const result = await fetchNasaImage(query, cache);
			if (!result) {
				status = { state: 'error', message: 'No images found' };
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
				message: err instanceof Error ? err.message : 'Failed to fetch NASA image',
			};
		}
	}
</script>

<div class="nasa-image-section">
	{#if status.state === 'idle'}
		<button class="fetch-btn" onclick={doFetch}>
			Load NASA Image
		</button>
	{:else if status.state === 'loading'}
		<div class="skeleton">
			<div class="skel-image"></div>
			<div class="skel-bar skel-short"></div>
		</div>
	{:else if status.state === 'error'}
		<div class="error-section">
			<span class="error-msg">{status.message}</span>
			<button class="retry-btn" onclick={doFetch}>Retry</button>
		</div>
	{:else if status.state === 'success'}
		<div class="image-header" in:fade={{ duration: 200 }}>
			<span class="image-label">NASA Image</span>
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

		<a
			href={status.data.originalUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="image-link"
			title="Open full resolution"
			in:fade={{ duration: 300, delay: 50 }}
		>
			<img
				src={status.data.thumbUrl}
				alt={objectName}
				class="nasa-thumb"
				class:loaded={thumbLoaded}
				loading="lazy"
				onload={() => { thumbLoaded = true; }}
			/>
		</a>

		<div class="image-meta" in:fade={{ duration: 200, delay: 100 }}>
			<span class="image-title">{status.data.title}</span>
			<span class="image-credit">{status.data.credit}</span>
		</div>

		<button class="refresh-btn" onclick={doFetch} in:fade={{ duration: 200, delay: 100 }}>Refresh</button>
	{/if}
</div>

<style>
	.nasa-image-section {
		border-top: 1px solid rgba(100, 120, 150, 0.15);
		padding: 0.4rem 0.7rem 0.5rem;
	}

	.fetch-btn {
		width: 100%;
		padding: 0.3rem 0;
		background: rgba(40, 100, 80, 0.2);
		border: 1px solid rgba(60, 140, 100, 0.3);
		border-radius: 3px;
		color: #60a080;
		font-family: inherit;
		font-size: 0.6rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: all 0.15s;
	}

	.fetch-btn:hover {
		background: rgba(40, 100, 80, 0.35);
		color: #80c0a0;
		border-color: rgba(80, 160, 120, 0.5);
	}

	.image-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.3rem;
	}

	.image-label {
		font-size: 0.55rem;
		color: #60a080;
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

	.image-link {
		display: block;
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid rgba(100, 120, 150, 0.2);
		transition: border-color 0.15s;
	}

	.image-link:hover {
		border-color: rgba(100, 180, 140, 0.4);
	}

	.nasa-thumb {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		background: rgba(20, 24, 36, 0.5);
		opacity: 0;
		transition: opacity 0.3s ease-out;
	}

	.nasa-thumb.loaded {
		opacity: 1;
	}

	.image-meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin-top: 0.25rem;
	}

	.image-title {
		font-size: 0.55rem;
		color: #9aa8b4;
		font-family: system-ui, sans-serif;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.image-credit {
		font-size: 0.5rem;
		color: #506070;
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

	.skel-image {
		width: 100%;
		aspect-ratio: 4 / 3;
		border-radius: 4px;
		background: rgba(100, 120, 150, 0.15);
		animation: skel-pulse 1.5s ease-in-out infinite;
	}

	.skel-bar {
		height: 0.5rem;
		border-radius: 3px;
		background: rgba(100, 120, 150, 0.15);
		animation: skel-pulse 1.5s ease-in-out infinite;
	}

	.skel-short { width: 40%; }

	@keyframes skel-pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}
</style>
