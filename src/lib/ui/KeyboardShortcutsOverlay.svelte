<script lang="ts">
	import { fade } from 'svelte/transition';

	interface Props {
		visible: boolean;
		onclose: () => void;
	}

	const { visible, onclose }: Props = $props();

	function onKeyDown(e: KeyboardEvent) {
		if (e.code === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}

	const sections: { title: string; shortcuts: { key: string; action: string }[] }[] = [
		{
			title: 'Camera',
			shortcuts: [
				{ key: 'Left Click + Drag', action: 'Orbit camera' },
				{ key: 'Right Click + Drag', action: 'Pan camera' },
				{ key: 'Scroll', action: 'Zoom in/out' },
				{ key: 'W A S D', action: 'Free-fly movement' },
				{ key: 'Shift', action: 'Boost free-fly speed' }
			]
		},
		{
			title: 'Selection & Navigation',
			shortcuts: [
				{ key: 'Click object', action: 'Select & view info' },
				{ key: '/ or Ctrl+F', action: 'Open search' },
				{ key: 'Escape', action: 'Close panel / deselect / cancel warp' }
			]
		},
		{
			title: 'Toggles',
			shortcuts: [
				{ key: 'H', action: 'Toggle HUD visibility' },
				{ key: 'T', action: 'Transfer orbit planner' },
				{ key: 'L', action: 'Toggle light paths' },
				{ key: 'G', action: 'Toggle geodesic explorer' },
				{ key: 'C', action: 'Toggle coordinate display' },
				{ key: 'B', action: 'Quick-save bookmark' },
				{ key: 'Shift+B', action: 'Open bookmarks panel' },
				{ key: 'F9', action: 'Take screenshot' },
				{ key: ',', action: 'Open settings' },
				{ key: '?', action: 'This shortcuts overlay' }
			]
		}
	];
</script>

{#if visible}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="shortcuts-backdrop"
	role="dialog"
	aria-modal="true"
	aria-label="Keyboard shortcuts"
	tabindex="-1"
	onkeydown={onKeyDown}
	transition:fade={{ duration: 200 }}
>
	<!-- Close on backdrop click -->
	<div class="shortcuts-backdrop-click" role="none" onclick={onclose}></div>

	<div class="shortcuts-panel">
		<div class="shortcuts-header">
			<h2 class="shortcuts-title">Keyboard Shortcuts</h2>
			<button class="close-btn" onclick={onclose} aria-label="Close shortcuts">✕</button>
		</div>

		<div class="shortcuts-body">
			{#each sections as section}
				<div class="shortcut-section">
					<h3 class="section-heading">{section.title}</h3>
					<dl class="shortcut-list">
						{#each section.shortcuts as s}
							<div class="shortcut-row">
								<dt class="shortcut-key">{s.key}</dt>
								<dd class="shortcut-action">{s.action}</dd>
							</div>
						{/each}
					</dl>
				</div>
			{/each}
		</div>

		<p class="shortcuts-hint">Press <kbd>?</kbd> or <kbd>Esc</kbd> to close</p>
	</div>
</div>
{/if}

<style>
	.shortcuts-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--sd-z-overlay, 500);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.shortcuts-backdrop-click {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
	}

	.shortcuts-panel {
		position: relative;
		display: flex;
		flex-direction: column;
		max-width: 520px;
		width: 90%;
		max-height: 80vh;
		padding: 1.5rem 2rem;
		background: var(--sd-surface-solid, #0a0c14);
		border: 1px solid var(--sd-border, rgba(100, 120, 150, 0.2));
		border-radius: var(--sd-radius-lg, 8px);
		color: var(--sd-text, #c0c8d0);
		font-family: var(--sd-font-body, system-ui, sans-serif);
		overflow-y: auto;
	}

	.shortcuts-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.shortcuts-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 400;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--sd-text-bright, #e0e8f0);
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--sd-text-dim, #6a7c8e);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: var(--sd-radius, 4px);
		transition: color var(--sd-transition, 0.15s ease);
	}

	.close-btn:hover {
		color: var(--sd-text-bright, #e0e8f0);
	}

	.shortcuts-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.shortcut-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.section-heading {
		margin: 0;
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--sd-text-dim, #6a7c8e);
		border-bottom: 1px solid rgba(100, 120, 150, 0.1);
		padding-bottom: 0.25rem;
	}

	.shortcut-list {
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.15rem 0;
	}

	.shortcut-key {
		font-family: var(--sd-font-mono, monospace);
		font-size: 0.7rem;
		color: var(--sd-accent, #80b0ff);
		min-width: 10rem;
		text-align: right;
	}

	.shortcut-action {
		margin: 0;
		font-size: 0.75rem;
		color: var(--sd-text, #c0c8d0);
	}

	.shortcuts-hint {
		margin: 1rem 0 0;
		font-size: 0.65rem;
		text-align: center;
		color: var(--sd-text-dim, #6a7c8e);
	}

	.shortcuts-hint kbd {
		font-family: var(--sd-font-mono, monospace);
		padding: 0.1rem 0.3rem;
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		font-size: 0.65rem;
		color: var(--sd-accent, #80b0ff);
	}

	@media (max-width: 768px) {
		.shortcuts-panel {
			padding: 1rem 1.25rem;
		}

		.shortcut-key {
			min-width: 7rem;
			font-size: 0.65rem;
		}

		.shortcut-action {
			font-size: 0.7rem;
		}
	}
</style>
