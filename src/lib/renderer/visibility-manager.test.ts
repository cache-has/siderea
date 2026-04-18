import { describe, it, expect } from 'vitest';
import { VisibilityManager, VISIBILITY_THRESHOLDS } from './visibility-manager';
import { Group } from 'three/webgpu';

function makeGroup(name: string): Group {
	const g = new Group();
	g.name = name;
	return g;
}

describe('VisibilityManager', () => {
	it('starts with all zones visible', () => {
		const vm = new VisibilityManager();
		const group = makeGroup('test');
		vm.addZone({
			label: 'Test',
			getObjects: () => [group],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});

		expect(vm.states).toEqual([{ label: 'Test', visible: true }]);
	});

	it('hides objects when camera exceeds hide threshold', () => {
		const vm = new VisibilityManager();
		const group = makeGroup('detail');
		vm.addZone({
			label: 'Near detail',
			getObjects: () => [group],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});

		// Camera moves far away
		vm.update(0.15);
		expect(group.visible).toBe(false);
		expect(vm.states[0].visible).toBe(false);
	});

	it('shows objects when camera comes within show threshold', () => {
		const vm = new VisibilityManager();
		const group = makeGroup('detail');
		vm.addZone({
			label: 'Near detail',
			getObjects: () => [group],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});

		// Hide first
		vm.update(0.15);
		expect(group.visible).toBe(false);

		// Move camera close
		vm.update(0.05);
		expect(group.visible).toBe(true);
	});

	it('implements hysteresis — no flicker in the gap between thresholds', () => {
		const vm = new VisibilityManager();
		const group = makeGroup('detail');
		vm.addZone({
			label: 'Near detail',
			getObjects: () => [group],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});

		// Start visible, camera at hysteresis gap (between show and hide)
		vm.update(0.10);
		expect(group.visible).toBe(true); // still visible — hasn't crossed hide threshold

		// Now hide
		vm.update(0.13);
		expect(group.visible).toBe(false);

		// In gap again — should stay hidden (hasn't crossed show threshold)
		vm.update(0.10);
		expect(group.visible).toBe(false);

		// Cross show threshold
		vm.update(0.07);
		expect(group.visible).toBe(true);
	});

	it('handles multiple zones independently', () => {
		const vm = new VisibilityManager();
		const nearGroup = makeGroup('near');
		const dwarfGroup = makeGroup('dwarf');

		vm.addZone({
			label: 'Near detail',
			getObjects: () => [nearGroup],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});
		vm.addZone({
			label: 'Dwarf planets',
			getObjects: () => [dwarfGroup],
			showThresholdPc: 0.06,
			hideThresholdPc: 0.10
		});

		// Camera at 0.11 pc — near detail visible, dwarf planets hidden
		vm.update(0.11);
		expect(nearGroup.visible).toBe(true); // within hide threshold
		expect(dwarfGroup.visible).toBe(false); // past hide threshold
	});

	it('showAll forces everything visible', () => {
		const vm = new VisibilityManager();
		const group = makeGroup('test');
		vm.addZone({
			label: 'Test',
			getObjects: () => [group],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});

		vm.update(1.0); // far away — hidden
		expect(group.visible).toBe(false);

		vm.showAll();
		expect(group.visible).toBe(true);
		expect(vm.states[0].visible).toBe(true);
	});

	it('handles null objects gracefully', () => {
		const vm = new VisibilityManager();
		vm.addZone({
			label: 'Nullable',
			getObjects: () => [null, undefined],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});

		// Should not throw
		vm.update(0.15);
		vm.update(0.05);
	});

	it('exports predefined thresholds', () => {
		expect(VISIBILITY_THRESHOLDS.NEAR_DETAIL.show).toBeLessThan(VISIBILITY_THRESHOLDS.NEAR_DETAIL.hide);
		expect(VISIBILITY_THRESHOLDS.DWARF_PLANETS.show).toBeLessThan(VISIBILITY_THRESHOLDS.DWARF_PLANETS.hide);
		expect(VISIBILITY_THRESHOLDS.NAVIGATION.show).toBeLessThan(VISIBILITY_THRESHOLDS.NAVIGATION.hide);
	});

	it('dispose clears all zones', () => {
		const vm = new VisibilityManager();
		vm.addZone({
			label: 'Test',
			getObjects: () => [],
			showThresholdPc: 0.08,
			hideThresholdPc: 0.12
		});

		vm.dispose();
		expect(vm.states).toHaveLength(0);
	});
});
