/** Reject undersized or empty workloads instead of publishing misleading benchmark timings. */
export function requireAtlasReferences(references: readonly string[]): string {
	const first = references[0];
	if (references.length !== 3 || !first)
		throw new Error('Need three iem-711 default references; run pnpm data:pull first.');
	return first;
}

export function requireAtlasWinners(
	result: { ok: false } | { ok: true; results: readonly unknown[] },
	workload: string
): void {
	if (!result.ok || result.results.length === 0)
		throw new Error(`${workload}: benchmark request returned no winners`);
}
