/** One resident computation per route. Rejected loads never poison retries. */
export class ScoreCache<T> {
	private entry: { key: string; pending: Promise<T> } | undefined;
	get(key: string, compute: () => Promise<T>): Promise<T> {
		if (this.entry?.key === key) return this.entry.pending;
		const pending = compute().catch((error: unknown) => {
			if (this.entry?.pending === pending) this.entry = undefined;
			throw error;
		});
		this.entry = { key, pending };
		return pending;
	}
}

function canonical(value: unknown): unknown {
	if (typeof value === 'number' && !Number.isFinite(value)) return { nonFiniteNumber: String(value) };
	if (Array.isArray(value)) return value.map((item: unknown) => canonical(item));
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, canonical(record[key])])
		);
	}
	return value;
}

/** Include the entire canonical request except view controls; retain array/reference order. */
export function scoringKey(version: string, request: object): string {
	const scoring = Object.fromEntries(
		Object.entries(request).filter(([key]) => !['sort', 'paretoOnly', 'topK'].includes(key))
	);
	return JSON.stringify([version, canonical(scoring)]);
}
