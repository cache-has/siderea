import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraMode, type CameraState } from '$lib/renderer/camera-controller';

// Stub localStorage
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store[key] ?? null,
	setItem: (key: string, value: string) => { store[key] = value; },
	removeItem: (key: string) => { delete store[key]; },
});

import { loadBookmarks, addBookmark, deleteBookmark, renameBookmark } from './bookmarks';

const mockCamera: CameraState = {
	mode: CameraMode.ORBIT,
	position: [1, 2, 3],
	target: [0, 0, 0],
	fov: 60,
	flySpeed: 2,
	pitch: 0,
	yaw: 0
};

describe('bookmarks', () => {
	beforeEach(() => {
		for (const key of Object.keys(store)) delete store[key];
	});

	it('loadBookmarks returns empty array when no bookmarks', () => {
		expect(loadBookmarks()).toEqual([]);
	});

	it('addBookmark creates and persists a bookmark', () => {
		const bm = addBookmark(mockCamera, 'Earth', 'body');
		expect(bm.label).toBe('Earth');
		expect(bm.targetName).toBe('Earth');
		expect(bm.targetKind).toBe('body');
		expect(bm.camera).toEqual(mockCamera);

		const loaded = loadBookmarks();
		expect(loaded).toHaveLength(1);
		expect(loaded[0].id).toBe(bm.id);
	});

	it('addBookmark uses default label when no target name', () => {
		const bm = addBookmark(mockCamera, null, null);
		expect(bm.label).toBe('Custom Location');
	});

	it('deleteBookmark removes bookmark by ID', () => {
		const bm1 = addBookmark(mockCamera, 'Earth', 'body');
		addBookmark(mockCamera, 'Mars', 'body');
		expect(loadBookmarks()).toHaveLength(2);

		deleteBookmark(bm1.id);
		const remaining = loadBookmarks();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].targetName).toBe('Mars');
	});

	it('renameBookmark updates label', () => {
		const bm = addBookmark(mockCamera, 'Earth', 'body');
		renameBookmark(bm.id, 'Home Planet');
		const loaded = loadBookmarks();
		expect(loaded[0].label).toBe('Home Planet');
	});

	it('newest bookmarks are first', () => {
		addBookmark(mockCamera, 'First', 'body');
		addBookmark(mockCamera, 'Second', 'body');
		const loaded = loadBookmarks();
		expect(loaded[0].label).toBe('Second');
		expect(loaded[1].label).toBe('First');
	});
});
