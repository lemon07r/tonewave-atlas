import { expect, test } from 'vitest';
import { sourceInForm, sourceOnPartition, sourcePartitions, type SourceMembership } from './sources.ts';
import { rigLabel } from './rigs.ts';

const mixed: SourceMembership = {
	form: 'iem',
	partition: 'iem-711',
	forms: ['iem', 'headphone'],
	partitions: ['iem-711', 'headphone-source-mixed']
};

test('actual memberships include a mixed source in both forms and every accepted rig', () => {
	expect(sourceInForm(mixed, 'iem')).toBe(true);
	expect(sourceInForm(mixed, 'headphone')).toBe(true);
	expect(sourceOnPartition(mixed, 'headphone-source-mixed')).toBe(true);
	expect(sourceOnPartition(mixed, 'iem-5128')).toBe(false);
	expect(rigLabel('headphone-source-mixed', [{ ...mixed, name: 'Mixed Reviewer' }])).toBe(
		'Headphone rig · Mixed Reviewer'
	);
});

test('legacy primary membership is a fallback only when the arrays are absent', () => {
	const legacy = { form: 'iem', partition: 'iem-711' } as const;
	expect(sourceInForm(legacy, 'iem')).toBe(true);
	expect(sourceInForm(legacy, 'headphone')).toBe(false);
	expect(sourcePartitions(legacy)).toEqual(['iem-711']);
	expect(sourceInForm({ ...mixed, forms: [] }, 'iem')).toBe(false);
	expect(sourceOnPartition({ ...mixed, partitions: [] }, 'iem-711')).toBe(false);
});
