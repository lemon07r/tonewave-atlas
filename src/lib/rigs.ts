import { sourcePartitions } from '#lib/sources.ts';
import type { Source } from '#core/dataset/types.ts';

/** Human rig labels; optional catalog sources resolve otherwise source-specific headphone rigs. */
export function rigLabel(
	partition: string,
	sources: readonly Pick<Source, 'partition' | 'partitions' | 'name'>[] = []
): string {
	if (partition === 'iem-711') return '711-family coupler';
	if (partition === 'iem-5128' || partition === 'headphone-5128') return 'B&K 5128';
	if (partition === 'headphone-4128') return 'B&K 4128';
	if (partition === 'headphone-ears-pro') return 'miniDSP EARS Pro';
	if (partition === 'headphone-ears') return 'miniDSP EARS';
	for (const [prefix, kind] of [
		['headphone-source-', 'Headphone rig'],
		['iem-source-', 'Unconfirmed IEM rig']
	] as const) {
		if (!partition.startsWith(prefix)) continue;
		const source = sources.find((item) => sourcePartitions(item).includes(partition));
		return `${kind} · ${source?.name ?? partition.slice(prefix.length)}`;
	}
	return partition;
}
