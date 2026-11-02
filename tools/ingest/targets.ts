import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GRID } from '#core/grid.ts';
import { parseMeasurement } from '#core/measurement/parse.ts';
import { resample } from '#core/measurement/resample.ts';
import type { ReferenceTarget } from '#core/dataset/types.ts';
import { ROOT } from './common.ts';

const inputs = [
	{
		id: 'harman-in-ear-2019',
		name: 'Harman in-ear 2019',
		partitions: ['iem-711'],
		file: 'Harman in-ear 2019.csv',
		description: 'A 711-family research preference reference, not a guarantee of individual preference.',
		attribution:
			'Olive, Welti & Khonsaripour, AES 143 paper 9840 (2017), https://aes.org/publications/elibrary-page/?id=19237; 2019 revision via AutoEq, github.com/jaakkopasanen/AutoEq (revision history: issues/85).'
	},
	{
		id: 'diffuse-field-5128',
		name: 'Diffuse field 5128',
		partitions: ['iem-5128'],
		file: 'Diffuse field 5128.csv',
		description: 'A 5128 diffuse-field acoustic reference, not a universal preferred listening response.',
		attribution:
			'Brüel & Kjær, Free-field and diffuse-field characteristics of High-frequency HATS Type 5128, ITU-T SG12 Contribution 257 (2018); Type 5128 product data BP2573, Fig. 3; via AutoEq, github.com/jaakkopasanen/AutoEq.'
	}
];

export async function referenceTargets(root = ROOT): Promise<ReferenceTarget[]> {
	return Promise.all(
		inputs.map(async ({ file, ...metadata }) => {
			const parsed = parseMeasurement(await readFile(resolve(root, 'data/targets', file), 'utf8'));
			if (!parsed.ok) throw new Error(`Invalid target ${file}: ${parsed.error}`);
			const values = resample(parsed.points);
			if (values.length !== GRID.length || !values.every(Number.isFinite))
				throw new Error(`Target ${file} must cover GRID`);
			return { ...metadata, form: 'iem', values: [...values] };
		})
	);
}
