/** Human rig labels; optional catalog sources resolve otherwise source-specific headphone rigs. */
export function rigLabel(
	partition: string,
	sources: readonly { partition: string; name: string }[] = []
): string {
	if (partition === 'iem-711') return '711-family coupler';
	if (partition === 'iem-5128' || partition === 'headphone-5128') return 'B&K 5128';
	if (partition === 'headphone-4128') return 'B&K 4128';
	if (partition === 'headphone-ears-pro') return 'miniDSP EARS Pro';
	if (partition === 'headphone-ears') return 'miniDSP EARS';
	if (partition.startsWith('headphone-source-')) {
		const source = sources.find((item) => item.partition === partition);
		return `Headphone rig · ${source?.name ?? partition.slice('headphone-source-'.length)}`;
	}
	return partition;
}
