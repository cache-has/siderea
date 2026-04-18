/**
 * Touch gesture handler for mobile/tablet camera control.
 *
 * Recognizes:
 * - **Single-finger drag** → orbit rotation (theta/phi deltas)
 * - **Two-finger pinch** → zoom (scale factor)
 * - **Two-finger drag** → pan (pixel deltas)
 * - **Single tap** → object selection (clientX, clientY)
 * - **Double tap** → auto-frame (clientX, clientY)
 *
 * Gestures are classified on the first touchmove after touchstart.
 * Callbacks receive the same kind of deltas that mouse events produce,
 * so the CameraController can reuse its existing orbit/zoom/pan logic.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TouchHandlerCallbacks {
	/** Orbit rotation delta (like mouse drag). dx/dy in pixels. */
	onOrbit: (dx: number, dy: number) => void;
	/** Zoom factor (like wheel scroll). >1 = zoom out, <1 = zoom in. */
	onZoom: (factor: number) => void;
	/** Pan delta (like right-click drag). dx/dy in pixels. */
	onPan: (dx: number, dy: number) => void;
	/** Single tap at screen position (like click). */
	onTap: (clientX: number, clientY: number) => void;
	/** Double tap at screen position (like double-click). */
	onDoubleTap: (clientX: number, clientY: number) => void;
}

export interface TouchHandlerOptions {
	/** Element to listen on. */
	element: HTMLElement;
	/** Gesture callbacks. */
	callbacks: TouchHandlerCallbacks;
	/** Orbit sensitivity multiplier (default: 1). */
	sensitivity?: number;
	/** Max time (ms) for a touch to count as a tap (default: 250). */
	tapTimeout?: number;
	/** Max movement (px) for a touch to count as a tap (default: 10). */
	tapMaxDistance?: number;
	/** Max time (ms) between taps for double-tap (default: 300). */
	doubleTapTimeout?: number;
}

const enum GestureState {
	NONE,
	/** Waiting to classify (touch started, no move yet). */
	PENDING,
	/** Single-finger orbit drag. */
	ORBIT,
	/** Two-finger gesture (pinch + pan). */
	TWO_FINGER,
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export class TouchHandler {
	private element: HTMLElement;
	private callbacks: TouchHandlerCallbacks;
	private sensitivity: number;
	private tapTimeout: number;
	private tapMaxDistance: number;
	private doubleTapTimeout: number;

	// Gesture state
	private state = GestureState.NONE;

	// Single-finger tracking
	private lastSingleX = 0;
	private lastSingleY = 0;
	private touchStartX = 0;
	private touchStartY = 0;
	private touchStartTime = 0;

	// Two-finger tracking
	private lastPinchDist = 0;
	private lastCentroidX = 0;
	private lastCentroidY = 0;

	// Double-tap detection
	private lastTapTime = 0;
	private lastTapX = 0;
	private lastTapY = 0;

	// Bound handlers
	private boundStart: (e: TouchEvent) => void;
	private boundMove: (e: TouchEvent) => void;
	private boundEnd: (e: TouchEvent) => void;

	constructor(options: TouchHandlerOptions) {
		this.element = options.element;
		this.callbacks = options.callbacks;
		this.sensitivity = options.sensitivity ?? 1;
		this.tapTimeout = options.tapTimeout ?? 250;
		this.tapMaxDistance = options.tapMaxDistance ?? 10;
		this.doubleTapTimeout = options.doubleTapTimeout ?? 300;

		this.boundStart = this.onTouchStart.bind(this);
		this.boundMove = this.onTouchMove.bind(this);
		this.boundEnd = this.onTouchEnd.bind(this);

		this.element.addEventListener('touchstart', this.boundStart, { passive: false });
		this.element.addEventListener('touchmove', this.boundMove, { passive: false });
		this.element.addEventListener('touchend', this.boundEnd, { passive: false });
		this.element.addEventListener('touchcancel', this.boundEnd, { passive: false });
	}

	/** Update orbit sensitivity multiplier. */
	setSensitivity(value: number): void {
		this.sensitivity = value;
	}

	/** Remove all event listeners. */
	dispose(): void {
		this.element.removeEventListener('touchstart', this.boundStart);
		this.element.removeEventListener('touchmove', this.boundMove);
		this.element.removeEventListener('touchend', this.boundEnd);
		this.element.removeEventListener('touchcancel', this.boundEnd);
	}

	// ─── Event handlers ────────────────────────────────────────────────────

	private onTouchStart(e: TouchEvent): void {
		e.preventDefault(); // prevent scroll/zoom browser defaults

		if (e.touches.length === 1) {
			const t = e.touches[0];
			this.lastSingleX = t.clientX;
			this.lastSingleY = t.clientY;
			this.touchStartX = t.clientX;
			this.touchStartY = t.clientY;
			this.touchStartTime = performance.now();
			this.state = GestureState.PENDING;
		} else if (e.touches.length === 2) {
			// Upgrade to two-finger gesture
			this.initTwoFinger(e.touches[0], e.touches[1]);
			this.state = GestureState.TWO_FINGER;
		}
	}

	private onTouchMove(e: TouchEvent): void {
		e.preventDefault();

		if (e.touches.length === 1 && (this.state === GestureState.PENDING || this.state === GestureState.ORBIT)) {
			const t = e.touches[0];
			// Classify pending as orbit on first move
			this.state = GestureState.ORBIT;

			const dx = (t.clientX - this.lastSingleX) * this.sensitivity;
			const dy = (t.clientY - this.lastSingleY) * this.sensitivity;
			this.lastSingleX = t.clientX;
			this.lastSingleY = t.clientY;

			this.callbacks.onOrbit(dx, dy);
		} else if (e.touches.length === 2 && this.state === GestureState.TWO_FINGER) {
			this.handleTwoFingerMove(e.touches[0], e.touches[1]);
		} else if (e.touches.length === 2 && this.state !== GestureState.TWO_FINGER) {
			// Second finger added mid-gesture — upgrade
			this.initTwoFinger(e.touches[0], e.touches[1]);
			this.state = GestureState.TWO_FINGER;
		}
	}

	private onTouchEnd(e: TouchEvent): void {
		e.preventDefault();

		if (e.touches.length === 0) {
			// All fingers lifted
			if (this.state === GestureState.PENDING) {
				// No move happened — this is a tap
				const elapsed = performance.now() - this.touchStartTime;
				const dx = this.lastSingleX - this.touchStartX;
				const dy = this.lastSingleY - this.touchStartY;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (elapsed < this.tapTimeout && dist < this.tapMaxDistance) {
					this.handleTap(this.touchStartX, this.touchStartY);
				}
			}
			this.state = GestureState.NONE;
		} else if (e.touches.length === 1 && this.state === GestureState.TWO_FINGER) {
			// Went from 2 fingers to 1 — restart as single-finger orbit
			const t = e.touches[0];
			this.lastSingleX = t.clientX;
			this.lastSingleY = t.clientY;
			this.state = GestureState.ORBIT;
		}
	}

	// ─── Gesture logic ─────────────────────────────────────────────────────

	private initTwoFinger(a: Touch, b: Touch): void {
		this.lastPinchDist = touchDistance(a, b);
		this.lastCentroidX = (a.clientX + b.clientX) / 2;
		this.lastCentroidY = (a.clientY + b.clientY) / 2;
	}

	private handleTwoFingerMove(a: Touch, b: Touch): void {
		const dist = touchDistance(a, b);
		const cx = (a.clientX + b.clientX) / 2;
		const cy = (a.clientY + b.clientY) / 2;

		// Pinch zoom
		if (this.lastPinchDist > 0) {
			const factor = this.lastPinchDist / dist; // >1 = fingers moved closer = zoom in
			this.callbacks.onZoom(factor);
		}

		// Pan (centroid movement)
		const pdx = cx - this.lastCentroidX;
		const pdy = cy - this.lastCentroidY;
		if (Math.abs(pdx) > 0.5 || Math.abs(pdy) > 0.5) {
			this.callbacks.onPan(pdx, pdy);
		}

		this.lastPinchDist = dist;
		this.lastCentroidX = cx;
		this.lastCentroidY = cy;
	}

	private handleTap(x: number, y: number): void {
		const now = performance.now();
		const timeSinceLastTap = now - this.lastTapTime;
		const dx = x - this.lastTapX;
		const dy = y - this.lastTapY;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (timeSinceLastTap < this.doubleTapTimeout && dist < this.tapMaxDistance * 2) {
			// Double tap
			this.callbacks.onDoubleTap(x, y);
			this.lastTapTime = 0; // reset so triple-tap doesn't re-trigger
		} else {
			// Single tap — fire immediately (no delay waiting for potential double-tap)
			this.callbacks.onTap(x, y);
			this.lastTapTime = now;
			this.lastTapX = x;
			this.lastTapY = y;
		}
	}
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function touchDistance(a: Touch, b: Touch): number {
	const dx = a.clientX - b.clientX;
	const dy = a.clientY - b.clientY;
	return Math.sqrt(dx * dx + dy * dy);
}
