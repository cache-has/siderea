<script lang="ts">
	import type { HudState } from './hud-state.svelte';

	interface Props {
		state: HudState;
	}

	const { state }: Props = $props();
</script>

{#if state.approachVisible && state.approachTarget}
	<div class="approach-toast" class:visible={state.approachVisible}>
		<span class="approach-icon">◈</span>
		<span class="approach-label">Approaching</span>
		<span class="approach-name">{state.approachTarget}</span>
	</div>
{/if}

<style>
	.approach-toast {
		position: fixed;
		top: 60px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 20px;
		background: var(--sd-surface-strong);
		border: 1px solid var(--sd-border);
		border-radius: 20px;
		font-family: var(--sd-font-body);
		font-size: 13px;
		color: var(--sd-text);
		pointer-events: none;
		z-index: 90;
		opacity: 0;
		animation: toast-in 0.4s ease-out forwards;
	}

	.approach-toast.visible {
		opacity: 1;
	}

	.approach-icon {
		color: var(--sd-accent);
		font-size: 14px;
	}

	.approach-label {
		color: var(--sd-text-muted);
		text-transform: uppercase;
		font-size: 10px;
		letter-spacing: 0.08em;
	}

	.approach-name {
		color: var(--sd-text-bright);
		font-weight: 500;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>
