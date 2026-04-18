import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub browser globals before importing
const locationState = { hash: '', pathname: '/', search: '' };
vi.stubGlobal('window', {
	location: locationState
});
vi.stubGlobal('history', {
	replaceState: (_data: unknown, _title: string, url: string) => {
		const hashIdx = url.indexOf('#');
		locationState.hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
	}
});

import { pushTargetToUrl, clearUrlTarget, parseUrlTarget } from './url-state';

describe('url-state', () => {
	beforeEach(() => {
		locationState.hash = '';
	});

	it('pushTargetToUrl sets hash with slug', () => {
		pushTargetToUrl('Earth');
		expect(locationState.hash).toBe('#/@earth');
	});

	it('pushTargetToUrl handles names with spaces', () => {
		pushTargetToUrl('Sagittarius A*');
		expect(locationState.hash).toBe('#/@sagittarius-a*');
	});

	it('parseUrlTarget returns name from hash', () => {
		locationState.hash = '#/@mars';
		expect(parseUrlTarget()).toBe('mars');
	});

	it('parseUrlTarget handles hyphenated slugs', () => {
		locationState.hash = '#/@sagittarius-a*';
		expect(parseUrlTarget()).toBe('sagittarius a*');
	});

	it('parseUrlTarget returns null for empty hash', () => {
		locationState.hash = '';
		expect(parseUrlTarget()).toBeNull();
	});

	it('parseUrlTarget returns null for non-target hash', () => {
		locationState.hash = '#/foo';
		expect(parseUrlTarget()).toBeNull();
	});

	it('clearUrlTarget removes hash', () => {
		locationState.hash = '#/@earth';
		clearUrlTarget();
		expect(locationState.hash).toBe('');
	});
});
