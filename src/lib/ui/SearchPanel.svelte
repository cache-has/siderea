<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { SolarSystemBody, Satellite, NotableStar, NotableObject } from '$lib/data/types';
	import {
		loadRecentSearches,
		saveRecentSearch,
		getSuggestions,
		type RecentSearch
	} from './fuzzy-search';

	/** A unified search result. */
	export interface SearchResult {
		name: string;
		kind: 'body' | 'satellite' | 'star' | 'nebula' | 'blackhole' | 'cluster' | 'other';
		/** Display subtitle (e.g. "Planet", "Emission Nebula"). */
		subtitle: string;
		/** Opaque data reference — the original object. */
		data: SolarSystemBody | Satellite | NotableStar | NotableObject;
	}

	/** Action the user wants to take on a result. */
	export type SearchAction = 'goto' | 'info';

	interface Props {
		visible: boolean;
		/** Called with the selected search result and chosen action. */
		onselect: (result: SearchResult, action: SearchAction) => void;
		/** Called when the panel is closed. */
		onclose: () => void;
		/** Search function provided by the parent (has access to catalogs). */
		search: (query: string) => SearchResult[];
	}

	const { visible, onselect, onclose, search }: Props = $props();

	let query = $state('');
	let results = $derived(query.length >= 1 ? search(query) : []);
	let selectedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let recentSearches = $state<RecentSearch[]>([]);

	// Load recent searches when panel becomes visible
	$effect(() => {
		if (visible) {
			recentSearches = loadRecentSearches();
			requestAnimationFrame(() => inputEl?.focus());
		} else {
			query = '';
			selectedIndex = 0;
		}
	});

	// Reset index when results change
	$effect(() => {
		if (results.length > 0 && selectedIndex >= results.length) {
			selectedIndex = 0;
		}
	});

	/** Items shown when query is empty: recent searches first, then suggestions. */
	const emptyStateItems = $derived.by(() => {
		if (query.length >= 1) return [];
		const items: RecentSearch[] = [];
		const seen = new Set<string>();

		for (const r of recentSearches) {
			if (!seen.has(r.name)) {
				items.push(r);
				seen.add(r.name);
			}
		}

		if (items.length < 8) {
			for (const s of getSuggestions()) {
				if (items.length >= 10) break;
				if (!seen.has(s.name)) {
					items.push(s);
					seen.add(s.name);
				}
			}
		}
		return items;
	});

	const displayItems = $derived(query.length >= 1 ? results : []);
	const showEmptyState = $derived(query.length === 0 && emptyStateItems.length > 0);

	function selectResult(result: SearchResult, action: SearchAction) {
		saveRecentSearch(result);
		onselect(result, action);
	}

	/** Handle selecting an empty-state item (recent/suggestion) by name. */
	function selectEmptyItem(item: RecentSearch) {
		// Search for it to get the full data object
		const found = search(item.name);
		const match = found.find((r) => r.name === item.name);
		if (match) {
			selectResult(match, 'goto');
		}
	}

	const KIND_ICONS: Record<string, string> = {
		body: '\u25CF',       // filled circle
		satellite: '\u25B3',  // triangle
		star: '\u2605',       // star
		nebula: '\u2601',     // cloud
		blackhole: '\u25C9',  // fisheye
		cluster: '\u2726',    // four-pointed star
		other: '\u25CB'       // circle outline
	};

	function onKeyDown(e: KeyboardEvent) {
		const listLen = displayItems.length || emptyStateItems.length;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, listLen - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (displayItems.length > 0 && selectedIndex < displayItems.length) {
				selectResult(displayItems[selectedIndex], 'goto');
			} else if (showEmptyState && selectedIndex < emptyStateItems.length) {
				selectEmptyItem(emptyStateItems[selectedIndex]);
			}
		} else if (e.key === 'Tab' && !e.shiftKey && displayItems.length > 0) {
			// Tab to "View info" action on selected result
			e.preventDefault();
			selectResult(displayItems[selectedIndex], 'info');
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}
</script>

{#if visible}
<div class="search-panel" role="dialog" aria-label="Object search" transition:fly={{ y: -20, duration: 200 }}>
	<div class="search-input-wrap">
		<input
			type="text"
			class="search-input"
			placeholder="Search objects..."
			bind:this={inputEl}
			bind:value={query}
			onkeydown={onKeyDown}
		/>
		<button class="close-btn" onclick={onclose} aria-label="Close search">&times;</button>
	</div>

	{#if displayItems.length > 0}
		<ul class="results-list">
			{#each displayItems as result, i}
				<li>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="result-row" class:selected={i === selectedIndex} onmouseenter={() => selectedIndex = i}>
						<button
							class="result-item"
							onclick={() => selectResult(result, 'goto')}
							title="Go to {result.name}"
						>
							<span class="result-icon kind-{result.kind}">{KIND_ICONS[result.kind] ?? KIND_ICONS.other}</span>
							<span class="result-name">{result.name}</span>
							<span class="result-subtitle">{result.subtitle}</span>
						</button>
						<div class="result-actions">
							<button
								class="action-btn"
								onclick={() => selectResult(result, 'goto')}
								title="Go to"
								aria-label="Go to {result.name}"
							>&#x2192;</button>
							<button
								class="action-btn"
								onclick={() => selectResult(result, 'info')}
								title="View info"
								aria-label="View info for {result.name}"
							>&#x2139;</button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{:else if showEmptyState}
		<div class="empty-state">
			{#if recentSearches.length > 0}
				<div class="section-label">Recent</div>
			{/if}
			<ul class="results-list">
				{#each emptyStateItems as item, i}
					{#if i === recentSearches.length && recentSearches.length > 0}
						<li><div class="section-label">Suggestions</div></li>
					{/if}
					<li>
						<button
							class="result-item"
							class:selected={i === selectedIndex}
							onclick={() => selectEmptyItem(item)}
							onmouseenter={() => selectedIndex = i}
						>
							<span class="result-icon kind-{item.kind}">{KIND_ICONS[item.kind] ?? KIND_ICONS.other}</span>
							<span class="result-name">{item.name}</span>
							<span class="result-subtitle">{item.subtitle}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{:else if query.length >= 1}
		<div class="no-results">No results</div>
	{/if}
</div>
{/if}

<style>
	.search-panel {
		position: fixed;
		top: 3rem;
		left: 50%;
		transform: translateX(-50%);
		width: 420px;
		max-height: 50vh;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		background: rgba(10, 12, 20, 0.92);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 8px;
		backdrop-filter: blur(12px);
		z-index: 300;
		pointer-events: auto;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.search-input-wrap {
		display: flex;
		align-items: center;
		padding: 0.5rem;
		border-bottom: 1px solid rgba(100, 120, 150, 0.15);
	}

	.search-input {
		flex: 1;
		background: rgba(30, 35, 50, 0.8);
		border: 1px solid rgba(80, 100, 140, 0.3);
		border-radius: 4px;
		color: #e0e8f0;
		font-family: inherit;
		font-size: 0.8rem;
		padding: 0.4rem 0.6rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.search-input:focus {
		border-color: rgba(80, 130, 220, 0.6);
	}

	.search-input::placeholder {
		color: #506070;
	}

	.close-btn {
		background: none;
		border: none;
		color: #6a7c8e;
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0 0.4rem;
		line-height: 1;
		transition: color 0.15s;
	}

	.close-btn:hover { color: #b0c0d0; }

	.results-list {
		list-style: none;
		margin: 0;
		padding: 0.2rem 0;
		overflow-y: auto;
		max-height: 40vh;
	}

	.results-list li {
		padding: 0 0.3rem;
	}

	.result-row {
		display: flex;
		align-items: center;
		border-radius: 4px;
		transition: background 0.1s;
	}

	.result-row:hover,
	.result-row.selected {
		background: rgba(60, 80, 120, 0.3);
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		padding: 0.35rem 0.5rem;
		background: none;
		border: none;
		border-radius: 4px;
		color: #c0c8d0;
		font-family: inherit;
		font-size: 0.7rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
		min-width: 0;
	}

	.result-item:hover,
	.result-item.selected {
		background: rgba(60, 80, 120, 0.3);
	}

	/* Inside a result-row, the item itself doesn't need its own hover */
	.result-row .result-item:hover {
		background: none;
	}

	.result-actions {
		display: flex;
		gap: 0.15rem;
		padding-right: 0.3rem;
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.result-row:hover .result-actions,
	.result-row.selected .result-actions {
		opacity: 1;
	}

	.action-btn {
		background: rgba(50, 60, 90, 0.5);
		border: 1px solid rgba(80, 100, 140, 0.3);
		border-radius: 3px;
		color: #90a0b0;
		font-size: 0.65rem;
		cursor: pointer;
		padding: 0.15rem 0.35rem;
		line-height: 1;
		transition: background 0.1s, color 0.1s;
	}

	.action-btn:hover {
		background: rgba(60, 80, 120, 0.6);
		color: #d0e0f0;
	}

	.result-icon {
		font-size: 0.8rem;
		width: 1.2rem;
		text-align: center;
		flex-shrink: 0;
	}

	.kind-body { color: #70c0f0; }
	.kind-satellite { color: #80c0a0; }
	.kind-star { color: #f0d070; }
	.kind-nebula { color: #e080a0; }
	.kind-blackhole { color: #c090f0; }
	.kind-cluster { color: #80e0e0; }
	.kind-other { color: #a0a0b0; }

	.result-name {
		flex: 1;
		color: #e0e8f0;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-subtitle {
		color: #6a7c8e;
		font-size: 0.6rem;
		flex-shrink: 0;
	}

	.no-results {
		padding: 0.8rem;
		text-align: center;
		color: #506070;
		font-size: 0.65rem;
	}

	.empty-state {
		overflow-y: auto;
		max-height: 40vh;
	}

	.section-label {
		padding: 0.4rem 0.7rem 0.15rem;
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #506070;
		font-weight: 600;
	}
</style>
