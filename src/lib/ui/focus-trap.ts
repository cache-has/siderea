/**
 * Svelte action for trapping keyboard focus within a container.
 *
 * Used on dialog panels to keep Tab/Shift+Tab cycling within the panel,
 * and Escape to close. Follows WAI-ARIA dialog pattern.
 */

interface FocusTrapOptions {
	/** Called when Escape is pressed. */
	onclose?: () => void;
	/** Whether the trap is active. @default true */
	active?: boolean;
}

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	let opts = { active: true, ...options };
	let previousFocus: HTMLElement | null = null;

	function getFocusable(): HTMLElement[] {
		return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!opts.active) return;

		if (e.key === 'Escape' && opts.onclose) {
			e.preventDefault();
			e.stopPropagation();
			opts.onclose();
			return;
		}

		if (e.key === 'Tab') {
			const focusable = getFocusable();
			if (focusable.length === 0) {
				e.preventDefault();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];

			if (e.shiftKey) {
				if (document.activeElement === first || !node.contains(document.activeElement)) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last || !node.contains(document.activeElement)) {
					e.preventDefault();
					first.focus();
				}
			}
		}
	}

	function activate() {
		previousFocus = document.activeElement as HTMLElement | null;
		node.addEventListener('keydown', handleKeydown);
		// Focus first focusable element (or the node itself) on next tick
		requestAnimationFrame(() => {
			const focusable = getFocusable();
			if (focusable.length > 0) {
				focusable[0].focus();
			} else {
				node.setAttribute('tabindex', '-1');
				node.focus();
			}
		});
	}

	function deactivate() {
		node.removeEventListener('keydown', handleKeydown);
		previousFocus?.focus();
	}

	if (opts.active) activate();

	return {
		update(newOptions: FocusTrapOptions) {
			const wasActive = opts.active;
			opts = { active: true, ...newOptions };
			if (opts.active && !wasActive) activate();
			if (!opts.active && wasActive) deactivate();
		},
		destroy() {
			deactivate();
		}
	};
}
