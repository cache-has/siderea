<script lang="ts">
	import { fade } from 'svelte/transition';

	export interface LoadingStage {
		id: string;
		label: string;
		status: 'pending' | 'loading' | 'done' | 'error';
		error?: string;
	}

	interface Props {
		stages: LoadingStage[];
		visible: boolean;
	}

	const { stages, visible }: Props = $props();

	const progress = $derived(() => {
		const done = stages.filter((s) => s.status === 'done').length;
		return stages.length > 0 ? done / stages.length : 0;
	});

	const currentStage = $derived(() => {
		return stages.find((s) => s.status === 'loading') ?? stages.find((s) => s.status === 'pending');
	});

	const allDone = $derived(stages.every((s) => s.status === 'done'));
</script>

{#if visible && !allDone}
<div class="loading-screen" role="status" aria-live="polite" aria-label="Loading Siderea" out:fade={{ duration: 400 }}>
	<div class="loading-content">
		<h1 class="title">SIDEREA</h1>
		<p class="subtitle">Universe Exploration Engine</p>

		<div class="progress-container">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {progress() * 100}%"></div>
			</div>
			<span class="progress-pct">{Math.round(progress() * 100)}%</span>
		</div>

		<ul class="stage-list" aria-label="Loading stages">
			{#each stages as stage (stage.id)}
				<li class="stage" class:done={stage.status === 'done'} class:loading={stage.status === 'loading'} class:error={stage.status === 'error'}>
					<span class="stage-icon">
						{#if stage.status === 'done'}
							&#x2713;
						{:else if stage.status === 'loading'}
							<span class="spinner"></span>
						{:else if stage.status === 'error'}
							&#x2717;
						{:else}
							&#x2022;
						{/if}
					</span>
					<span class="stage-label">{stage.label}</span>
					{#if stage.error}
						<span class="stage-error">{stage.error}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</div>
{/if}

<style>
	.loading-screen {
		position: fixed;
		inset: 0;
		z-index: var(--sd-z-loading, 1000);
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
		color: var(--sd-text, #c0c8d0);
		font-family: var(--sd-font-body, system-ui, sans-serif);
	}

	.loading-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		max-width: 360px;
		width: 90%;
	}

	.title {
		margin: 0;
		font-size: 2rem;
		font-weight: 300;
		letter-spacing: 0.4em;
		text-transform: uppercase;
		color: var(--sd-text-bright, #e0e8f0);
	}

	.subtitle {
		margin: -1rem 0 0;
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		color: var(--sd-text-muted, #8090a0);
	}

	.progress-container {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.progress-bar {
		flex: 1;
		height: 3px;
		background: rgba(60, 80, 120, 0.4);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4080d0, #80c0ff);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.progress-pct {
		font-family: var(--sd-font-mono, monospace);
		font-size: 0.7rem;
		color: var(--sd-text-muted, #8090a0);
		min-width: 2.5rem;
		text-align: right;
	}

	.stage-list {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.stage {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--sd-text-dim, #6a7c8e);
		font-family: var(--sd-font-mono, monospace);
		transition: color 0.2s ease;
	}

	.stage.loading {
		color: var(--sd-text, #c0c8d0);
	}

	.stage.done {
		color: var(--sd-accent-green, #40c080);
	}

	.stage.error {
		color: #f06050;
	}

	.stage-icon {
		width: 1rem;
		text-align: center;
		flex-shrink: 0;
	}

	.stage-label {
		flex: 1;
	}

	.stage-error {
		font-size: 0.65rem;
		color: #f06050;
		opacity: 0.8;
	}

	.spinner {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		border: 1.5px solid rgba(100, 120, 150, 0.3);
		border-top-color: var(--sd-accent, #80b0ff);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
