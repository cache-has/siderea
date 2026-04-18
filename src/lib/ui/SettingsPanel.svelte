<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { focusTrap } from './focus-trap';
	import type { SettingsState } from './settings-state.svelte';
	import type { QualityPreset, LabelDensity, UnitPreference } from './settings-state.svelte';
	import type { TleFetchStatus } from '$lib/data/celestrak';

	interface Props {
		settings: SettingsState;
		onupdatetle?: () => void;
		tleFetchStatus?: TleFetchStatus;
	}

	const { settings, onupdatetle, tleFetchStatus }: Props = $props();

	const QUALITY_LABELS: Record<QualityPreset, string> = {
		low: 'Low',
		medium: 'Medium',
		high: 'High',
		ultra: 'Ultra'
	};

	const LABEL_LABELS: Record<LabelDensity, string> = {
		none: 'None',
		notable: 'Notable Only',
		all: 'All Visible'
	};

	const UNIT_LABELS: Record<UnitPreference, string> = {
		auto: 'Auto',
		km: 'Kilometers',
		AU: 'AU',
		ly: 'Light-years',
		pc: 'Parsecs'
	};

	function formatSensitivity(v: number): string {
		return (v * 1000).toFixed(1);
	}
</script>

<!-- Gear button -->
{#if !settings.panelVisible}
<button
	class="gear-btn"
	onclick={() => settings.togglePanel()}
	title="Settings (,)"
	aria-label="Open settings"
	transition:fade={{ duration: 150 }}
>
	<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
		<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
		<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
	</svg>
</button>
{/if}

<!-- Settings panel -->
{#if settings.panelVisible}
<div class="settings-panel" transition:fly={{ x: 300, duration: 250 }} use:focusTrap={{ onclose: () => settings.togglePanel() }}>
	<div class="panel-header">
		<span class="panel-title">Settings</span>
		<button class="close-btn" onclick={() => settings.togglePanel()} aria-label="Close settings">&times;</button>
	</div>

	<div class="panel-body">
		<!-- Visual Quality -->
		<div class="section">
			<span class="section-label">Visual Quality</span>
			<div class="button-group">
				{#each (['low', 'medium', 'high', 'ultra'] as const) as preset}
					<button
						class="option-btn"
						class:active={settings.quality === preset}
						onclick={() => { settings.quality = preset; }}
					>{QUALITY_LABELS[preset]}</button>
				{/each}
			</div>
		</div>

		<!-- Star Rendering -->
		<div class="section">
			<span class="section-label">Stars</span>
			<div class="setting-row">
				<span class="setting-name">Glow Intensity</span>
				<input
					type="range"
					min="0"
					max="1.5"
					step="0.1"
					value={settings.bloomStrength}
					oninput={(e) => { settings.bloomStrength = parseFloat(e.currentTarget.value); }}
					class="slider"
					aria-label="Glow intensity"
				/>
				<span class="setting-value">{settings.bloomStrength.toFixed(1)}</span>
			</div>
			<div class="setting-row">
				<span class="setting-name">Twinkling</span>
				<button
					class="option-btn small"
					class:active={settings.scintillation}
					onclick={() => settings.toggleScintillation()}
				>{settings.scintillation ? 'On' : 'Off'}</button>
			</div>
		</div>

		<!-- Label Density -->
		<div class="section">
			<span class="section-label">Label Density</span>
			<div class="button-group">
				{#each (['none', 'notable', 'all'] as const) as density}
					<button
						class="option-btn"
						class:active={settings.labelDensity === density}
						onclick={() => { settings.labelDensity = density; }}
					>{LABEL_LABELS[density]}</button>
				{/each}
			</div>
		</div>

		<!-- Warp -->
		<div class="section">
			<span class="section-label">Warp Travel</span>
			<div class="setting-row">
				<span class="setting-name">Duration</span>
				<input
					type="range"
					min="1"
					max="15"
					step="0.5"
					value={settings.warpDuration}
					oninput={(e) => { settings.warpDuration = parseFloat(e.currentTarget.value); }}
					class="slider"
					aria-label="Warp duration"
				/>
				<span class="setting-value">{settings.warpDuration.toFixed(1)}s</span>
			</div>
		</div>

		<!-- Unit Preferences -->
		<div class="section">
			<span class="section-label">Distance Units</span>
			<div class="button-group">
				{#each (['auto', 'km', 'AU', 'ly', 'pc'] as const) as unit}
					<button
						class="option-btn"
						class:active={settings.unitPreference === unit}
						onclick={() => { settings.unitPreference = unit; }}
					>{UNIT_LABELS[unit]}</button>
				{/each}
			</div>
		</div>

		<!-- Controls -->
		<div class="section">
			<span class="section-label">Controls</span>
			<div class="setting-row">
				<span class="setting-name">Orbit Sensitivity</span>
				<input
					type="range"
					min="0.5"
					max="10"
					step="0.5"
					value={settings.orbitSensitivity * 1000}
					oninput={(e) => { settings.orbitSensitivity = parseFloat(e.currentTarget.value) / 1000; }}
					class="slider"
					aria-label="Orbit sensitivity"
				/>
				<span class="setting-value">{formatSensitivity(settings.orbitSensitivity)}</span>
			</div>
			<div class="setting-row">
				<span class="setting-name">Look Sensitivity</span>
				<input
					type="range"
					min="0.5"
					max="10"
					step="0.5"
					value={settings.lookSensitivity * 1000}
					oninput={(e) => { settings.lookSensitivity = parseFloat(e.currentTarget.value) / 1000; }}
					class="slider"
					aria-label="Look sensitivity"
				/>
				<span class="setting-value">{formatSensitivity(settings.lookSensitivity)}</span>
			</div>
			<div class="setting-row">
				<span class="setting-name">Touch Sensitivity</span>
				<input
					type="range"
					min="0.25"
					max="4"
					step="0.25"
					value={settings.touchSensitivity}
					oninput={(e) => { settings.touchSensitivity = parseFloat(e.currentTarget.value); }}
					class="slider"
					aria-label="Touch sensitivity"
				/>
				<span class="setting-value">{settings.touchSensitivity.toFixed(2)}×</span>
			</div>
		</div>

		<!-- Satellite Data -->
		{#if onupdatetle}
		<div class="section">
			<span class="section-label">Satellite Data</span>
			<div class="setting-row">
				<button
					class="update-tle-btn"
					onclick={onupdatetle}
					disabled={tleFetchStatus?.state === 'loading'}
				>
					{#if tleFetchStatus?.state === 'loading'}
						Updating...
					{:else}
						Update TLE Data
					{/if}
				</button>
				{#if tleFetchStatus?.state === 'success'}
					<span class="tle-status success">{tleFetchStatus.updated} updated</span>
				{:else if tleFetchStatus?.state === 'error'}
					<span class="tle-status error" title={tleFetchStatus.message}>Failed</span>
				{/if}
			</div>
			<span class="tle-hint">Refresh orbital data from CelesTrak</span>
		</div>
		{/if}

		<!-- Accessibility -->
		<div class="section">
			<span class="section-label">Accessibility</span>
			<div class="setting-row">
				<span class="setting-name">Reduced Motion</span>
				<button
					class="option-btn small"
					class:active={settings.reducedMotion}
					onclick={() => settings.toggleReducedMotion()}
					aria-label="Toggle reduced motion"
				>{settings.reducedMotion ? 'On' : 'Off'}</button>
			</div>
			<span class="a11y-hint">Disables animations, warp effects, and twinkling</span>
		</div>

		<!-- Reset -->
		<div class="section reset-section">
			<button class="reset-btn" onclick={() => settings.resetAll()}>
				Reset to Defaults
			</button>
		</div>
	</div>
</div>
{/if}

<style>
	.gear-btn {
		position: fixed;
		top: 1rem;
		left: 1rem;
		background: rgba(10, 12, 20, 0.7);
		border: 1px solid rgba(100, 120, 150, 0.2);
		border-radius: 4px;
		padding: 0.4rem;
		color: #8090a0;
		cursor: pointer;
		backdrop-filter: blur(4px);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.gear-btn:hover {
		border-color: rgba(120, 140, 170, 0.5);
		color: #b0c0d0;
	}

	.settings-panel {
		position: fixed;
		top: 1rem;
		left: 1rem;
		width: 280px;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		background: rgba(10, 12, 20, 0.92);
		border: 1px solid rgba(100, 120, 150, 0.25);
		border-radius: 6px;
		backdrop-filter: blur(8px);
		z-index: 200;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.7rem;
		color: #c0c8d0;
		pointer-events: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid rgba(100, 120, 150, 0.15);
	}

	.panel-title {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #d0d8e0;
	}

	.close-btn {
		background: none;
		border: none;
		color: #6a7c8e;
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0 0.2rem;
		line-height: 1;
	}

	.close-btn:hover {
		color: #c0c8d0;
	}

	.panel-body {
		padding: 0.3rem 0;
	}

	.section {
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid rgba(100, 120, 150, 0.08);
	}

	.section:last-child {
		border-bottom: none;
	}

	.section-label {
		display: block;
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #6a7c8e;
		margin-bottom: 0.4rem;
	}

	.button-group {
		display: flex;
		gap: 3px;
		flex-wrap: wrap;
	}

	.option-btn {
		background: rgba(60, 70, 90, 0.4);
		border: 1px solid rgba(100, 120, 150, 0.3);
		border-radius: 3px;
		color: #8090a0;
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.2rem 0.45rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.option-btn:hover {
		border-color: rgba(120, 140, 170, 0.5);
		color: #b0c0d0;
	}

	.option-btn.active {
		background: rgba(80, 120, 180, 0.3);
		border-color: rgba(100, 150, 220, 0.5);
		color: #c0d8f0;
	}

	.option-btn.small {
		min-width: 2.5rem;
		text-align: center;
	}

	.setting-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.3rem;
	}

	.setting-row:last-child {
		margin-bottom: 0;
	}

	.setting-name {
		flex: 0 0 auto;
		min-width: 5.5rem;
		color: #8090a0;
		font-size: 0.62rem;
	}

	.slider {
		flex: 1;
		height: 3px;
		-webkit-appearance: none;
		appearance: none;
		background: rgba(60, 80, 120, 0.4);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #6090c0;
		border: 1px solid rgba(100, 150, 220, 0.6);
		cursor: pointer;
	}

	.slider::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #6090c0;
		border: 1px solid rgba(100, 150, 220, 0.6);
		cursor: pointer;
	}

	.setting-value {
		min-width: 2rem;
		text-align: right;
		color: #a0b0c0;
		font-size: 0.6rem;
		font-variant-numeric: tabular-nums;
	}

	.reset-section {
		display: flex;
		justify-content: center;
		padding-top: 0.6rem;
	}

	.reset-btn {
		background: rgba(60, 70, 90, 0.3);
		border: 1px solid rgba(100, 120, 150, 0.2);
		border-radius: 3px;
		color: #6a7c8e;
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.reset-btn:hover {
		border-color: rgba(180, 100, 100, 0.4);
		color: #c08080;
	}

	.update-tle-btn {
		background: rgba(60, 90, 70, 0.3);
		border: 1px solid rgba(100, 150, 120, 0.3);
		border-radius: 3px;
		color: #80b090;
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.update-tle-btn:hover:not(:disabled) {
		border-color: rgba(120, 180, 140, 0.5);
		color: #a0d0b0;
	}

	.update-tle-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.tle-status {
		font-size: 0.55rem;
		margin-left: auto;
	}

	.tle-status.success { color: #80c0a0; }
	.tle-status.error { color: #c08080; }

	.tle-hint,
	.a11y-hint {
		display: block;
		font-size: 0.5rem;
		color: #697d87;
		margin-top: 0.2rem;
	}
</style>
