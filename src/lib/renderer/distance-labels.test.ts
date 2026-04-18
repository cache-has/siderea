import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { originPositionGetter, meshPositionGetter } from './distance-labels';

describe('originPositionGetter', () => {
	it('returns the origin vector', () => {
		const getter = originPositionGetter();
		const pos = getter();
		expect(pos.x).toBe(0);
		expect(pos.y).toBe(0);
		expect(pos.z).toBe(0);
	});

	it('returns the same reference each call', () => {
		const getter = originPositionGetter();
		expect(getter()).toBe(getter());
	});
});

describe('meshPositionGetter', () => {
	it('returns null when mesh is undefined', () => {
		const getter = meshPositionGetter(() => undefined);
		expect(getter()).toBeNull();
	});

	it('returns world position when mesh exists', () => {
		// Create a minimal mock mesh with getWorldPosition
		const mockMesh = {
			getWorldPosition: (target: Vector3) => {
				target.set(1, 2, 3);
				return target;
			}
		};
		const getter = meshPositionGetter(() => mockMesh as any);
		const pos = getter()!;
		expect(pos).not.toBeNull();
		expect(pos.x).toBe(1);
		expect(pos.y).toBe(2);
		expect(pos.z).toBe(3);
	});
});
