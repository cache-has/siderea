/**
 * URL hash state for deep-linking and sharing.
 *
 * Encodes the current target object in the URL hash so users can share
 * links like `siderea.app/#/@earth` or `siderea.app/#/@sgra*`.
 *
 * Format: #/@<object-name>
 * Object names are lowercased and spaces replaced with hyphens.
 */

// ─── Encoding ───────────────────────────────────────────────────────────────

/** Encode an object name to a URL-safe slug. */
function nameToSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9\-*'.]/g, '');
}

/** Decode a URL slug back to a search-friendly name. */
function slugToName(slug: string): string {
	return slug.replace(/-/g, ' ');
}

/** Write the current target to the URL hash without triggering navigation. */
export function pushTargetToUrl(name: string): void {
	const slug = nameToSlug(name);
	const hash = `#/@${slug}`;
	if (window.location.hash !== hash) {
		history.replaceState(null, '', hash);
	}
}

/** Clear the URL hash (when deselecting). */
export function clearUrlTarget(): void {
	if (window.location.hash) {
		history.replaceState(null, '', window.location.pathname + window.location.search);
	}
}

/** Parse the URL hash for a target object name. Returns null if no target encoded. */
export function parseUrlTarget(): string | null {
	const hash = window.location.hash;
	if (!hash.startsWith('#/@')) return null;
	const slug = hash.slice(3); // remove '#/@'
	if (!slug) return null;
	return slugToName(slug);
}
