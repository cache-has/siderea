import { describe, it, expect } from 'vitest';
import { focusTrap } from './focus-trap';

describe('focusTrap', () => {
	it('is exported as a function', () => {
		expect(typeof focusTrap).toBe('function');
	});
});
