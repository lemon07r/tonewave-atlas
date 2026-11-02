export interface ValidationFigure {
	id: string;
	support: string;
	products: number | null;
	sources: number | null;
	pairs: number | null;
	folds: number | null;
	before: number | null;
	after: number | null;
	medianBefore: number | null;
	improvements: number[];
}
const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const finite = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Read only published validation metadata. Missing fields are unknown, never zero or legacy figures. */
export function validationFigures(catalog: unknown): ValidationFigure[] {
	const partitions = record(catalog).partitions;
	if (!Array.isArray(partitions)) throw new Error('Dataset partition metadata is unavailable.');
	return partitions.flatMap((value: unknown) => {
		const partition = record(value);
		if (typeof partition.id !== 'string') return [];
		const statistics = record(partition.statistics),
			support = record(statistics.support),
			validation = record(statistics.harmonisation);
		return [
			{
				id: partition.id,
				support:
					typeof support.reason === 'string'
						? support.reason
						: support.status === 'sufficient'
							? 'Sufficient cross-source support'
							: 'Cross-source support not reported',
				products: finite(support.multiSourceProducts),
				sources: finite(support.sources),
				pairs: finite(validation.pairs),
				folds: finite(validation.foldCount),
				before: finite(validation.meanBefore),
				after: finite(validation.meanAfter),
				medianBefore: finite(validation.medianBefore),
				improvements: Array.isArray(validation.folds)
					? validation.folds.flatMap((fold: unknown) => {
							const improvement = finite(record(fold).meanImprovement);
							return improvement === null ? [] : [improvement];
						})
					: []
			}
		];
	});
}

export async function loadValidation(url: string, signal: AbortSignal): Promise<ValidationFigure[]> {
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`Validation metadata request failed (${response.status}).`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const decoded =
		bytes[0] === 0x1f && bytes[1] === 0x8b
			? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
			: new TextDecoder().decode(bytes);
	const catalog: unknown = JSON.parse(decoded);
	return validationFigures(catalog);
}
