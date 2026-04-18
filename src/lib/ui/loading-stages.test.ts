import { describe, it, expect } from 'vitest';
import type { LoadingStage } from './LoadingScreen.svelte';

/** Replicates the updateStage helper used in +page.svelte. */
function updateStage(stages: LoadingStage[], id: string, status: LoadingStage['status'], error?: string) {
	const stage = stages.find((s) => s.id === id);
	if (stage) {
		stage.status = status;
		if (error) stage.error = error;
	}
}

function makeStages(): LoadingStage[] {
	return [
		{ id: 'renderer', label: 'Initializing renderer', status: 'pending' },
		{ id: 'wasm', label: 'Loading physics engine', status: 'pending' },
		{ id: 'solar', label: 'Loading solar system', status: 'pending' },
		{ id: 'stars', label: 'Loading star catalog', status: 'pending' },
		{ id: 'notable', label: 'Loading deep-sky objects', status: 'pending' }
	];
}

describe('Loading stages', () => {
	it('all start pending', () => {
		const stages = makeStages();
		expect(stages.every((s) => s.status === 'pending')).toBe(true);
	});

	it('updateStage transitions to loading', () => {
		const stages = makeStages();
		updateStage(stages, 'wasm', 'loading');
		expect(stages.find((s) => s.id === 'wasm')!.status).toBe('loading');
	});

	it('updateStage transitions to done', () => {
		const stages = makeStages();
		updateStage(stages, 'stars', 'loading');
		updateStage(stages, 'stars', 'done');
		expect(stages.find((s) => s.id === 'stars')!.status).toBe('done');
	});

	it('updateStage records error', () => {
		const stages = makeStages();
		updateStage(stages, 'renderer', 'error', 'WebGPU not supported');
		const s = stages.find((s) => s.id === 'renderer')!;
		expect(s.status).toBe('error');
		expect(s.error).toBe('WebGPU not supported');
	});

	it('progress can be computed from stage statuses', () => {
		const stages = makeStages();
		const progress = () => stages.filter((s) => s.status === 'done').length / stages.length;

		expect(progress()).toBe(0);
		updateStage(stages, 'wasm', 'done');
		updateStage(stages, 'solar', 'done');
		expect(progress()).toBeCloseTo(0.4);

		for (const s of stages) s.status = 'done';
		expect(progress()).toBe(1);
	});

	it('ignores unknown stage ids', () => {
		const stages = makeStages();
		updateStage(stages, 'nonexistent', 'done');
		expect(stages.every((s) => s.status === 'pending')).toBe(true);
	});
});
