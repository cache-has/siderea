import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TouchHandler, type TouchHandlerCallbacks } from './touch-handler';

interface MockElement extends HTMLElement {
	_fire(type: string, event: Partial<TouchEvent>): void;
}

/** Create a minimal mock element with touch event listener support. */
function createMockElement(): MockElement {
	const listeners: Record<string, EventListener[]> = {};
	return {
		addEventListener: vi.fn((type: string, fn: EventListener) => {
			(listeners[type] ??= []).push(fn);
		}),
		removeEventListener: vi.fn(),
		_fire(type: string, event: Partial<TouchEvent>) {
			for (const fn of listeners[type] ?? []) {
				fn(event as Event);
			}
		},
	} as unknown as MockElement;
}

function touch(id: number, x: number, y: number): Touch {
	return { identifier: id, clientX: x, clientY: y } as Touch;
}

function touchEvent(touches: Touch[]): Partial<TouchEvent> {
	return {
		touches: touches as unknown as TouchList,
		preventDefault: vi.fn(),
	};
}

describe('TouchHandler', () => {
	let el: ReturnType<typeof createMockElement>;
	let callbacks: TouchHandlerCallbacks;
	let handler: TouchHandler;

	beforeEach(() => {
		el = createMockElement();
		callbacks = {
			onOrbit: vi.fn(),
			onZoom: vi.fn(),
			onPan: vi.fn(),
			onTap: vi.fn(),
			onDoubleTap: vi.fn(),
		};
		handler = new TouchHandler({
			element: el,
			callbacks,
			tapTimeout: 250,
			tapMaxDistance: 10,
			doubleTapTimeout: 300,
		});
	});

	it('registers touch event listeners on element', () => {
		expect(el.addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: false });
		expect(el.addEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
		expect(el.addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function), { passive: false });
		expect(el.addEventListener).toHaveBeenCalledWith('touchcancel', expect.any(Function), { passive: false });
	});

	it('removes listeners on dispose', () => {
		handler.dispose();
		expect(el.removeEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function));
		expect(el.removeEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function));
		expect(el.removeEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
		expect(el.removeEventListener).toHaveBeenCalledWith('touchcancel', expect.any(Function));
	});

	describe('single-finger orbit', () => {
		it('emits orbit deltas on single-finger drag', () => {
			el._fire('touchstart', touchEvent([touch(0, 100, 200)]));
			el._fire('touchmove', touchEvent([touch(0, 110, 215)]));

			expect(callbacks.onOrbit).toHaveBeenCalledWith(10, 15);
		});

		it('applies sensitivity multiplier', () => {
			handler.setSensitivity(2);
			el._fire('touchstart', touchEvent([touch(0, 100, 200)]));
			el._fire('touchmove', touchEvent([touch(0, 105, 210)]));

			expect(callbacks.onOrbit).toHaveBeenCalledWith(10, 20);
		});

		it('tracks deltas incrementally across multiple moves', () => {
			el._fire('touchstart', touchEvent([touch(0, 100, 200)]));
			el._fire('touchmove', touchEvent([touch(0, 110, 200)]));
			el._fire('touchmove', touchEvent([touch(0, 120, 200)]));

			expect(callbacks.onOrbit).toHaveBeenCalledTimes(2);
			expect(callbacks.onOrbit).toHaveBeenNthCalledWith(1, 10, 0);
			expect(callbacks.onOrbit).toHaveBeenNthCalledWith(2, 10, 0);
		});
	});

	describe('two-finger pinch zoom', () => {
		it('emits zoom factor on pinch', () => {
			// Start with fingers 100px apart
			el._fire('touchstart', touchEvent([touch(0, 50, 100)]));
			el._fire('touchstart', touchEvent([touch(0, 50, 100), touch(1, 150, 100)]));

			// Move fingers closer (50px apart) — zoom in, factor = 100/50 = 2
			el._fire('touchmove', touchEvent([touch(0, 75, 100), touch(1, 125, 100)]));

			expect(callbacks.onZoom).toHaveBeenCalledWith(2);
		});

		it('emits zoom factor < 1 when fingers spread apart', () => {
			el._fire('touchstart', touchEvent([touch(0, 50, 100), touch(1, 150, 100)]));
			// Spread to 200px apart: factor = 100/200 = 0.5
			el._fire('touchmove', touchEvent([touch(0, 0, 100), touch(1, 200, 100)]));

			expect(callbacks.onZoom).toHaveBeenCalledWith(0.5);
		});
	});

	describe('two-finger pan', () => {
		it('emits pan deltas from centroid movement', () => {
			// Start: centroid at (100, 100)
			el._fire('touchstart', touchEvent([touch(0, 50, 100), touch(1, 150, 100)]));
			// Move both fingers right by 20: centroid at (120, 100)
			el._fire('touchmove', touchEvent([touch(0, 70, 100), touch(1, 170, 100)]));

			expect(callbacks.onPan).toHaveBeenCalledWith(20, 0);
		});
	});

	describe('tap detection', () => {
		it('fires onTap for a quick touch with no movement', () => {
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(1000)  // touchstart
				.mockReturnValueOnce(1100); // touchend (100ms later)

			el._fire('touchstart', touchEvent([touch(0, 200, 300)]));
			el._fire('touchend', touchEvent([])); // all fingers lifted

			expect(callbacks.onTap).toHaveBeenCalledWith(200, 300);
		});

		it('does not fire onTap if touch lasted too long', () => {
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(1000)
				.mockReturnValueOnce(1500); // 500ms > 250ms timeout

			el._fire('touchstart', touchEvent([touch(0, 200, 300)]));
			el._fire('touchend', touchEvent([]));

			expect(callbacks.onTap).not.toHaveBeenCalled();
		});

		it('does not fire onTap if finger moved too far', () => {
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(1000)
				.mockReturnValueOnce(1100);

			el._fire('touchstart', touchEvent([touch(0, 200, 300)]));
			// Move far enough to classify as orbit
			el._fire('touchmove', touchEvent([touch(0, 250, 350)]));
			el._fire('touchend', touchEvent([]));

			expect(callbacks.onTap).not.toHaveBeenCalled();
			expect(callbacks.onOrbit).toHaveBeenCalled();
		});
	});

	describe('double-tap detection', () => {
		it('fires onDoubleTap for two quick taps', () => {
			vi.spyOn(performance, 'now')
				.mockReturnValueOnce(1000)   // first touchstart
				.mockReturnValueOnce(1100)   // first touchend → tap
				.mockReturnValueOnce(1100)   // tap handler reads time for lastTapTime
				.mockReturnValueOnce(1200)   // second touchstart
				.mockReturnValueOnce(1300)   // second touchend → double-tap detected
				.mockReturnValueOnce(1300);  // double-tap handler reads time

			el._fire('touchstart', touchEvent([touch(0, 200, 300)]));
			el._fire('touchend', touchEvent([]));

			el._fire('touchstart', touchEvent([touch(0, 200, 300)]));
			el._fire('touchend', touchEvent([]));

			expect(callbacks.onTap).toHaveBeenCalledTimes(1); // first tap
			expect(callbacks.onDoubleTap).toHaveBeenCalledWith(200, 300);
		});
	});

	describe('gesture transitions', () => {
		it('upgrades from single-finger to two-finger mid-gesture', () => {
			el._fire('touchstart', touchEvent([touch(0, 100, 200)]));
			el._fire('touchmove', touchEvent([touch(0, 110, 200)]));
			expect(callbacks.onOrbit).toHaveBeenCalledTimes(1);

			// Second finger appears
			el._fire('touchmove', touchEvent([touch(0, 110, 200), touch(1, 210, 200)]));
			// Now pinch
			el._fire('touchmove', touchEvent([touch(0, 120, 200), touch(1, 200, 200)]));

			expect(callbacks.onZoom).toHaveBeenCalled();
		});

		it('downgrades from two-finger to single-finger when one lifts', () => {
			el._fire('touchstart', touchEvent([touch(0, 50, 100), touch(1, 150, 100)]));
			el._fire('touchmove', touchEvent([touch(0, 60, 100), touch(1, 160, 100)]));

			// Lift one finger — remaining touch at (160, 100)
			el._fire('touchend', {
				touches: [touch(1, 160, 100)] as unknown as TouchList,
				preventDefault: vi.fn(),
			});

			// Continue with single finger
			el._fire('touchmove', touchEvent([touch(1, 170, 100)]));
			expect(callbacks.onOrbit).toHaveBeenCalledWith(10, 0);
		});
	});
});
