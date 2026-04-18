<script lang="ts">
	import type { BreadcrumbEntry } from './hud-state.svelte';

	interface Props {
		breadcrumbs: BreadcrumbEntry[];
		/** Navigate back to the previous breadcrumb. */
		onback: () => void;
		/** Navigate to a specific breadcrumb by index. */
		ongoto: (index: number) => void;
	}

	const { breadcrumbs, onback, ongoto }: Props = $props();

	const KIND_ICONS: Record<string, string> = {
		body: '\u25CF',
		satellite: '\u25B3',
		star: '\u2605',
		nebula: '\u2601',
		blackhole: '\u25C9',
		cluster: '\u2726'
	};

	// Show only last 5 breadcrumbs in the trail
	const visible = $derived(breadcrumbs.slice(-5));
	const startIndex = $derived(breadcrumbs.length - visible.length);
</script>

{#if breadcrumbs.length > 0}
<div class="breadcrumb-trail">
	<button
		class="back-btn"
		onclick={onback}
		title="Go back"
		disabled={breadcrumbs.length < 2}
	>
		&#x2190;
	</button>

	<div class="crumbs">
		{#if startIndex > 0}
			<span class="ellipsis">&hellip;</span>
		{/if}
		{#each visible as crumb, i}
			{@const globalIndex = startIndex + i}
			{@const isLast = globalIndex === breadcrumbs.length - 1}
			{#if i > 0}
				<span class="separator">&#x203A;</span>
			{/if}
			<button
				class="crumb"
				class:active={isLast}
				onclick={() => ongoto(globalIndex)}
				title={crumb.name}
			>
				<span class="crumb-icon kind-{crumb.kind}">{KIND_ICONS[crumb.kind] ?? '\u25CB'}</span>
				<span class="crumb-name">{crumb.name}</span>
			</button>
		{/each}
	</div>
</div>
{/if}

<style>
	.breadcrumb-trail {
		position: fixed;
		top: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.65rem;
		color: #8090a0;
		background: rgba(10, 12, 20, 0.7);
		border: 1px solid rgba(100, 120, 150, 0.2);
		border-radius: 4px;
		padding: 0.25rem 0.4rem;
		backdrop-filter: blur(4px);
		z-index: 100;
		pointer-events: auto;
		max-width: 80vw;
	}

	.back-btn {
		background: rgba(60, 70, 90, 0.4);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		color: #8090a0;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.1rem 0.3rem;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.back-btn:hover:not(:disabled) {
		border-color: rgba(120, 140, 170, 0.5);
		color: #b0c0d0;
	}

	.back-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.crumbs {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		overflow: hidden;
	}

	.ellipsis {
		color: #506070;
		padding: 0 0.15rem;
	}

	.separator {
		color: #405060;
		padding: 0 0.1rem;
	}

	.crumb {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		background: none;
		border: none;
		color: #7088a0;
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.1rem 0.25rem;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
		max-width: 120px;
		overflow: hidden;
	}

	.crumb:hover {
		background: rgba(60, 80, 120, 0.25);
		color: #a0b8d0;
	}

	.crumb.active {
		color: #c0d0e0;
		font-weight: 500;
	}

	.crumb-icon { font-size: 0.55rem; }
	.kind-body { color: #70c0f0; }
	.kind-satellite { color: #80c0a0; }
	.kind-star { color: #f0d070; }
	.kind-nebula { color: #e080a0; }
	.kind-blackhole { color: #c090f0; }
	.kind-cluster { color: #80e0e0; }

	.crumb-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
