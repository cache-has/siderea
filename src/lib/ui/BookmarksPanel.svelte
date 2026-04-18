<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import { loadBookmarks, deleteBookmark, renameBookmark, type Bookmark } from '$lib/engine/bookmarks';

	interface Props {
		visible: boolean;
		onclose: () => void;
		onload: (bookmark: Bookmark) => void;
	}

	const { visible, onclose, onload }: Props = $props();

	let bookmarks = $state<Bookmark[]>([]);
	let editingId = $state<string | null>(null);
	let editLabel = $state('');

	// Refresh bookmarks list when panel opens
	$effect(() => {
		if (visible) {
			bookmarks = loadBookmarks();
		}
	});

	function handleDelete(id: string) {
		deleteBookmark(id);
		bookmarks = loadBookmarks();
	}

	function startRename(bm: Bookmark) {
		editingId = bm.id;
		editLabel = bm.label;
	}

	function commitRename() {
		if (editingId && editLabel.trim()) {
			renameBookmark(editingId, editLabel.trim());
			bookmarks = loadBookmarks();
		}
		editingId = null;
	}

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				month: 'short', day: 'numeric', year: 'numeric'
			});
		} catch {
			return iso.slice(0, 10);
		}
	}

	const kindIcons: Record<string, string> = {
		body: 'planet',
		satellite: 'sat',
		star: 'star',
		blackhole: 'BH',
		nebula: 'neb',
		cluster: 'cl'
	};
</script>

{#if visible}
<div class="bookmarks-backdrop" transition:fade={{ duration: 150 }}>
	<div
		class="bookmarks-panel"
		role="dialog"
		aria-modal="true"
		aria-label="Bookmarks"
		use:focusTrap
		transition:fly={{ x: 200, duration: 200 }}
	>
		<header class="panel-header">
			<h2 class="panel-title">Bookmarks</h2>
			<button class="close-btn" onclick={onclose} aria-label="Close bookmarks">&times;</button>
		</header>

		{#if bookmarks.length === 0}
			<p class="empty-msg">No bookmarks yet. Press <kbd>B</kbd> to bookmark your current view.</p>
		{:else}
			<ul class="bookmark-list">
				{#each bookmarks as bm (bm.id)}
					<li class="bookmark-item">
						{#if editingId === bm.id}
							<form class="rename-form" onsubmit={(e) => { e.preventDefault(); commitRename(); }}>
								<input
									class="rename-input"
									type="text"
									bind:value={editLabel}
									onblur={commitRename}
									autofocus
								/>
							</form>
						{:else}
							<button class="bookmark-btn" onclick={() => onload(bm)}>
								{#if bm.targetKind}
									<span class="kind-badge">{kindIcons[bm.targetKind] ?? '?'}</span>
								{/if}
								<span class="bookmark-label">{bm.label}</span>
								<span class="bookmark-date">{formatDate(bm.createdAt)}</span>
							</button>
							<div class="bookmark-actions">
								<button class="action-btn" onclick={() => startRename(bm)} aria-label="Rename bookmark" title="Rename">&#9998;</button>
								<button class="action-btn action-delete" onclick={() => handleDelete(bm.id)} aria-label="Delete bookmark" title="Delete">&times;</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
{/if}

<style>
	.bookmarks-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--sd-z-overlay, 500);
		background: rgba(0, 0, 0, 0.5);
	}

	.bookmarks-panel {
		position: fixed;
		top: 60px;
		right: 16px;
		width: 320px;
		max-height: calc(100vh - 120px);
		overflow-y: auto;
		background: var(--sd-surface-solid, #0a0c14);
		border: 1px solid var(--sd-border, rgba(100, 120, 150, 0.2));
		border-radius: var(--sd-radius-lg, 8px);
		color: var(--sd-text, #c0c8d0);
		font-family: var(--sd-font-body, system-ui, sans-serif);
		z-index: var(--sd-z-overlay, 500);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--sd-border, rgba(100, 120, 150, 0.2));
	}

	.panel-title {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--sd-text-bright, #e0e8f0);
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--sd-text-dim, #6a7c8e);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}
	.close-btn:hover { color: var(--sd-text-bright, #e0e8f0); }

	.empty-msg {
		padding: 1.5rem 1rem;
		margin: 0;
		font-size: 0.75rem;
		color: var(--sd-text-dim, #6a7c8e);
		text-align: center;
		line-height: 1.5;
	}

	.empty-msg kbd {
		display: inline-block;
		padding: 0.1em 0.4em;
		font-family: var(--sd-font-mono, monospace);
		font-size: 0.7rem;
		color: var(--sd-accent, #80b0ff);
		background: rgba(80, 120, 180, 0.15);
		border: 1px solid rgba(100, 150, 220, 0.3);
		border-radius: 3px;
	}

	.bookmark-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem 0;
	}

	.bookmark-item {
		display: flex;
		align-items: center;
		padding: 0 0.5rem;
	}

	.bookmark-btn {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: none;
		border: none;
		color: var(--sd-text, #c0c8d0);
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		text-align: left;
		border-radius: var(--sd-radius, 4px);
		transition: background 0.1s;
	}
	.bookmark-btn:hover {
		background: rgba(80, 120, 180, 0.15);
	}

	.kind-badge {
		display: inline-block;
		min-width: 2rem;
		text-align: center;
		padding: 0.15em 0.3em;
		font-size: 0.6rem;
		font-family: var(--sd-font-mono, monospace);
		color: var(--sd-accent, #80b0ff);
		background: rgba(80, 120, 180, 0.15);
		border-radius: 3px;
		text-transform: uppercase;
	}

	.bookmark-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bookmark-date {
		font-size: 0.6rem;
		color: var(--sd-text-dim, #6a7c8e);
		white-space: nowrap;
	}

	.bookmark-actions {
		display: flex;
		gap: 0.15rem;
	}

	.action-btn {
		background: none;
		border: none;
		color: var(--sd-text-dim, #6a7c8e);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.2rem 0.3rem;
		border-radius: 3px;
		line-height: 1;
	}
	.action-btn:hover {
		background: rgba(80, 120, 180, 0.2);
		color: var(--sd-text-bright, #e0e8f0);
	}
	.action-delete:hover {
		color: #ff6060;
	}

	.rename-form {
		flex: 1;
		padding: 0.25rem;
	}

	.rename-input {
		width: 100%;
		padding: 0.3rem 0.5rem;
		font-family: inherit;
		font-size: 0.75rem;
		color: var(--sd-text-bright, #e0e8f0);
		background: rgba(80, 120, 180, 0.1);
		border: 1px solid var(--sd-accent, #80b0ff);
		border-radius: var(--sd-radius, 4px);
		outline: none;
	}

	@media (max-width: 768px) {
		.bookmarks-panel {
			right: 0;
			top: auto;
			bottom: 0;
			width: 100%;
			max-height: 50vh;
			border-radius: var(--sd-radius-lg, 8px) var(--sd-radius-lg, 8px) 0 0;
		}
	}
</style>
