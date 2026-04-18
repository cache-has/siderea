<script lang="ts">
	import { fade } from 'svelte/transition';
	import { tick } from 'svelte';

	interface Props {
		visible: boolean;
		ondismiss: () => void;
	}

	const { visible, ondismiss }: Props = $props();

	let step = $state(0);
	let actionBtn = $state<HTMLButtonElement>(undefined!);

	// Reset step when overlay opens; focus action button
	$effect(() => {
		if (visible) {
			step = 0;
			tick().then(() => actionBtn?.focus());
		}
	});

	const steps = [
		{
			title: 'Welcome to Siderea',
			description: 'Explore the solar system and beyond. Travel between planets, trace light paths through curved spacetime, and experience the scale of the cosmos.',
			controls: [
				{ key: 'Left Click + Drag', action: 'Orbit camera' },
				{ key: 'Right Click + Drag', action: 'Pan camera' },
				{ key: 'Scroll', action: 'Zoom in/out' },
				{ key: 'Click object', action: 'Select & view info' }
			],
			action: 'Next'
		},
		{
			title: 'Navigate the Cosmos',
			description: 'Move freely through space, search for objects, and warp to distant destinations.',
			controls: [
				{ key: 'W A S D', action: 'Free-fly movement' },
				{ key: '/ or Ctrl+K', action: 'Search for any object' },
				{ key: 'Double-click', action: 'Warp to object' },
				{ key: 'Escape', action: 'Cancel warp / deselect' }
			],
			action: 'Next'
		},
		{
			title: 'Tools & Features',
			description: 'Explore specialized tools for orbital mechanics, light physics, and more.',
			controls: [
				{ key: 'T', action: 'Transfer orbit planner' },
				{ key: 'L', action: 'Toggle light paths' },
				{ key: 'B', action: 'Bookmark current view' },
				{ key: 'F9', action: 'Screenshot' },
				{ key: '?', action: 'All keyboard shortcuts' }
			],
			action: 'Start Exploring'
		}
	];

	const currentStep = $derived(steps[step]);
	const isLast = $derived(step === steps.length - 1);

	function advance() {
		if (isLast) {
			ondismiss();
		} else {
			step++;
			tick().then(() => actionBtn?.focus());
		}
	}
</script>

{#if visible}
<div class="welcome-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to Siderea" transition:fade={{ duration: 300 }}>
	<div class="welcome-panel">
		<h1 class="welcome-title">{currentStep.title}</h1>
		<p class="welcome-desc">{currentStep.description}</p>

		<div class="controls-section">
			<h2 class="controls-heading">Controls</h2>
			<dl class="controls-list">
				{#each currentStep.controls as ctrl}
					<div class="control-row">
						<dt class="control-key">{ctrl.key}</dt>
						<dd class="control-action">{ctrl.action}</dd>
					</div>
				{/each}
			</dl>
		</div>

		<!-- Step indicator dots -->
		<div class="step-dots" aria-label="Tutorial step {step + 1} of {steps.length}">
			{#each steps as _, i}
				<button
					class="dot"
					class:active={i === step}
					class:visited={i < step}
					onclick={() => { step = i; }}
					aria-label="Go to step {i + 1}"
				></button>
			{/each}
		</div>

		<div class="button-row">
			{#if step > 0}
				<button class="back-btn" onclick={() => { step--; }}>Back</button>
			{/if}
			<button class="start-btn" bind:this={actionBtn} onclick={advance}>
				{currentStep.action}
			</button>
		</div>

		<label class="dont-show">
			<input type="checkbox" onchange={(e) => {
				if (e.currentTarget.checked) {
					try { localStorage.setItem('siderea-welcome-dismissed', '1'); } catch {}
				} else {
					try { localStorage.removeItem('siderea-welcome-dismissed'); } catch {}
				}
			}} />
			Don't show again
		</label>
	</div>
</div>
{/if}

<style>
	.welcome-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--sd-z-overlay, 500);
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(8px);
	}

	.welcome-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		max-width: 440px;
		width: 90%;
		padding: 2rem 2.5rem;
		background: var(--sd-surface-solid, #0a0c14);
		border: 1px solid var(--sd-border, rgba(100, 120, 150, 0.2));
		border-radius: var(--sd-radius-lg, 8px);
		color: var(--sd-text, #c0c8d0);
		font-family: var(--sd-font-body, system-ui, sans-serif);
	}

	.welcome-title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 300;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--sd-text-bright, #e0e8f0);
	}

	.welcome-desc {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		text-align: center;
		color: var(--sd-text-muted, #8090a0);
	}

	.controls-section {
		width: 100%;
	}

	.controls-heading {
		margin: 0 0 0.5rem;
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--sd-text-dim, #6a7c8e);
	}

	.controls-list {
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.control-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.2rem 0;
	}

	.control-key {
		font-family: var(--sd-font-mono, monospace);
		font-size: 0.7rem;
		color: var(--sd-accent, #80b0ff);
		min-width: 10rem;
		text-align: right;
	}

	.control-action {
		margin: 0;
		font-size: 0.75rem;
		color: var(--sd-text, #c0c8d0);
	}

	.step-dots {
		display: flex;
		gap: 0.5rem;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1px solid rgba(100, 150, 220, 0.4);
		background: transparent;
		cursor: pointer;
		padding: 0;
		transition: all 0.2s;
	}
	.dot.active {
		background: var(--sd-accent, #80b0ff);
		border-color: var(--sd-accent, #80b0ff);
	}
	.dot.visited {
		background: rgba(80, 120, 180, 0.4);
	}

	.button-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.back-btn {
		padding: 0.5rem 1.25rem;
		background: transparent;
		border: 1px solid var(--sd-border, rgba(100, 120, 150, 0.2));
		border-radius: var(--sd-radius, 4px);
		color: var(--sd-text-muted, #8090a0);
		font-family: var(--sd-font-body, system-ui, sans-serif);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.back-btn:hover {
		border-color: rgba(100, 120, 150, 0.4);
		color: var(--sd-text, #c0c8d0);
	}

	.start-btn {
		padding: 0.6rem 2rem;
		background: rgba(80, 120, 180, 0.25);
		border: 1px solid rgba(100, 150, 220, 0.4);
		border-radius: var(--sd-radius, 4px);
		color: var(--sd-text-bright, #e0e8f0);
		font-family: var(--sd-font-body, system-ui, sans-serif);
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all var(--sd-transition, 0.15s ease);
	}

	.start-btn:hover {
		background: rgba(80, 120, 180, 0.4);
		border-color: rgba(100, 150, 220, 0.6);
	}

	.start-btn:focus-visible {
		outline: 2px solid var(--sd-accent, #80b0ff);
		outline-offset: 2px;
	}

	.dont-show {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		color: var(--sd-text-dim, #6a7c8e);
		cursor: pointer;
	}

	.dont-show input {
		accent-color: var(--sd-accent, #80b0ff);
	}

	@media (max-width: 768px) {
		.welcome-panel {
			padding: 1.5rem;
		}

		.control-key {
			min-width: 7rem;
			font-size: 0.65rem;
		}

		.control-action {
			font-size: 0.7rem;
		}
	}
</style>
