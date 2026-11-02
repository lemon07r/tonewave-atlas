import { expect, test } from 'vitest';
import { rigLabel } from './rigs.ts';

test.each([
	['iem-711', '711-family coupler'],
	['iem-5128', 'B&K 5128'],
	['headphone-5128', 'B&K 5128'],
	['headphone-4128', 'B&K 4128'],
	['headphone-ears-pro', 'miniDSP EARS Pro'],
	['headphone-ears', 'miniDSP EARS'],
	['headphone-source-example', 'Headphone rig · example'],
	['custom-rig', 'custom-rig']
])('labels %s as %s', (partition, label) => {
	expect(rigLabel(partition)).toBe(label);
});

test('uses a known source name only for its own source-specific rig', () => {
	const sources = [{ partition: 'headphone-source-example', name: 'Example Reviewer' }];
	expect(rigLabel('headphone-source-example', sources)).toBe('Headphone rig · Example Reviewer');
	expect(rigLabel('headphone-source-other', sources)).toBe('Headphone rig · other');
	expect(rigLabel('iem-711', sources)).toBe('711-family coupler');
});
