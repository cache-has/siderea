/**
 * Bookmark system for saving favorite camera locations.
 *
 * Persists to localStorage. Each bookmark captures:
 * - Camera state (position, target, mode, FOV)
 * - Selected object name and kind (for re-selection on load)
 * - User-given label
 * - Timestamp
 */

import type { CameraState } from '$lib/renderer/camera-controller';

const STORAGE_KEY = 'siderea-bookmarks';
const MAX_BOOKMARKS = 50;

export interface Bookmark {
	/** Unique ID (timestamp-based). */
	id: string;
	/** User-given label (defaults to object name or "Custom Location"). */
	label: string;
	/** Camera state at time of bookmarking. */
	camera: CameraState;
	/** Name of the selected object, if any. */
	targetName: string | null;
	/** Kind of the selected object. */
	targetKind: 'body' | 'satellite' | 'star' | 'blackhole' | 'nebula' | 'cluster' | null;
	/** ISO timestamp when created. */
	createdAt: string;
}

/** Load bookmarks from localStorage. */
export function loadBookmarks(): Bookmark[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed;
	} catch {
		return [];
	}
}

/** Save bookmarks to localStorage. */
function saveBookmarks(bookmarks: Bookmark[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
	} catch {
		// Quota exceeded or private browsing
	}
}

/** Add a new bookmark. Returns the created bookmark. */
export function addBookmark(
	camera: CameraState,
	targetName: string | null,
	targetKind: Bookmark['targetKind'],
	label?: string
): Bookmark {
	const bookmarks = loadBookmarks();
	const bookmark: Bookmark = {
		id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		label: label || targetName || 'Custom Location',
		camera,
		targetName,
		targetKind,
		createdAt: new Date().toISOString()
	};
	bookmarks.unshift(bookmark);
	// Trim to max
	if (bookmarks.length > MAX_BOOKMARKS) bookmarks.length = MAX_BOOKMARKS;
	saveBookmarks(bookmarks);
	return bookmark;
}

/** Delete a bookmark by ID. */
export function deleteBookmark(id: string): void {
	const bookmarks = loadBookmarks().filter(b => b.id !== id);
	saveBookmarks(bookmarks);
}

/** Rename a bookmark. */
export function renameBookmark(id: string, newLabel: string): void {
	const bookmarks = loadBookmarks();
	const bm = bookmarks.find(b => b.id === id);
	if (bm) {
		bm.label = newLabel;
		saveBookmarks(bookmarks);
	}
}
