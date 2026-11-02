import type { Form, Source } from '#core/dataset/types.ts';

/** Compatible with the optional mixed-source membership declared by the data lane. */
export type SourceMembership = Pick<Source, 'form' | 'partition'> & {
	forms?: readonly Form[];
	partitions?: readonly string[];
};

export function sourceInForm(source: SourceMembership, form: Form): boolean {
	return (source.forms ?? [source.form]).includes(form);
}

export function sourcePartitions(
	source: Pick<SourceMembership, 'partition' | 'partitions'>
): readonly string[] {
	return source.partitions ?? [source.partition];
}

export function sourceOnPartition(source: SourceMembership, partition: string): boolean {
	return sourcePartitions(source).includes(partition);
}
