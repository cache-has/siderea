<script lang="ts">
	import { fade } from 'svelte/transition';

	interface Props {
		visible: boolean;
		error: string;
		onretry: () => void;
	}

	const { visible, error, onretry }: Props = $props();

	const isWebGPUError = $derived(
		error.toLowerCase().includes('webgpu') ||
		error.toLowerCase().includes('gpu') ||
		error.toLowerCase().includes('adapter')
	);

	const isWebGLError = $derived(
		error.toLowerCase().includes('webgl') ||
		error.toLowerCase().includes('context')
	);

	const suggestion = $derived(
		isWebGPUError
			? 'Your browser or device may not support WebGPU. Try Chrome 113+ or Edge 113+, or enable WebGPU in browser flags.'
			: isWebGLError
				? 'WebGL context creation failed. Try closing other GPU-intensive tabs, updating your graphics drivers, or restarting your browser.'
				: 'An unexpected error occurred during rendering. Try reloading the page.'
	);
</script>

{#if visible}
<div class="error-backdrop" transition:fade={{ duration: 300 }}>
	<div class="error-panel">
		<div class="error-icon">!</div>
		<h1 class="error-title">Rendering Error</h1>
		<p class="error-message">{error}</p>
		<p class="error-suggestion">{suggestion}</p>
		<div class="error-actions">
			<button class="retry-btn" onclick={onretry}>Retry</button>
			<button class="reload-btn" onclick={() => window.location.reload()}>Reload Page</button>
		</div>
		<p class="error-help">
			If this keeps happening, please
			<a href="https://github.com/anthropics/claude-code/issues" target="_blank" rel="noopener">report the issue</a>
			with your browser version and GPU info.
		</p>
	</div>
</div>
{/if}

<style>
	.error-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--sd-z-overlay, 500);
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.95);
	}

	.error-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		max-width: 480px;
		width: 90%;
		padding: 2rem 2.5rem;
		background: var(--sd-surface-solid, #0a0c14);
		border: 1px solid rgba(255, 80, 80, 0.3);
		border-radius: var(--sd-radius-lg, 8px);
		color: var(--sd-text, #c0c8d0);
		font-family: var(--sd-font-body, system-ui, sans-serif);
	}

	.error-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 700;
		color: #ff6060;
		border: 2px solid rgba(255, 80, 80, 0.5);
		border-radius: 50%;
	}

	.error-title {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 400;
		color: var(--sd-text-bright, #e0e8f0);
	}

	.error-message {
		margin: 0;
		padding: 0.75rem 1rem;
		width: 100%;
		font-family: var(--sd-font-mono, monospace);
		font-size: 0.7rem;
		color: #ff8080;
		background: rgba(255, 60, 60, 0.08);
		border-radius: var(--sd-radius, 4px);
		word-break: break-word;
		max-height: 120px;
		overflow-y: auto;
	}

	.error-suggestion {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.5;
		text-align: center;
		color: var(--sd-text-muted, #8090a0);
	}

	.error-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.retry-btn, .reload-btn {
		padding: 0.5rem 1.5rem;
		font-family: inherit;
		font-size: 0.8rem;
		border-radius: var(--sd-radius, 4px);
		cursor: pointer;
		transition: all 0.15s;
	}

	.retry-btn {
		background: rgba(80, 120, 180, 0.25);
		border: 1px solid rgba(100, 150, 220, 0.4);
		color: var(--sd-text-bright, #e0e8f0);
	}
	.retry-btn:hover {
		background: rgba(80, 120, 180, 0.4);
		border-color: rgba(100, 150, 220, 0.6);
	}

	.reload-btn {
		background: transparent;
		border: 1px solid var(--sd-border, rgba(100, 120, 150, 0.2));
		color: var(--sd-text-muted, #8090a0);
	}
	.reload-btn:hover {
		border-color: rgba(100, 120, 150, 0.4);
		color: var(--sd-text, #c0c8d0);
	}

	.error-help {
		margin: 0;
		font-size: 0.65rem;
		color: var(--sd-text-dim, #6a7c8e);
		text-align: center;
	}

	.error-help a {
		color: var(--sd-accent, #80b0ff);
		text-decoration: none;
	}
	.error-help a:hover { text-decoration: underline; }
</style>
