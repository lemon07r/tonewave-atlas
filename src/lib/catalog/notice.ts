const seen = new Set<string>();
const key = 'tonewave.catalog-notices.v1';

/** Quiet migration notices appear once per tab, even when an unresolved saved item remains. */
export function migrationMessages(messages: readonly string[]): string[] {
	try {
		const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
		if (Array.isArray(saved)) for (const message of saved) if (typeof message === 'string') seen.add(message);
	} catch {
		/* Storage may be unavailable; the in-memory session still deduplicates. */
	}
	const fresh = [...new Set(messages)].filter((message) => !seen.has(message));
	for (const message of fresh) seen.add(message);
	try {
		sessionStorage.setItem(key, JSON.stringify([...seen]));
	} catch {
		/* A notice must never prevent loading the catalog. */
	}
	return fresh;
}
