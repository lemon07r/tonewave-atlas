import { expect, test } from 'vitest';
import { validationFigures } from './validation.ts';

test('uses current published metadata without substituting absent legacy fields', () => {
	const figures = validationFigures({
		partitions: [
			{
				id: 'rig-a',
				statistics: {
					support: { status: 'sufficient', multiSourceProducts: 21, sources: 4 },
					harmonisation: {
						pairs: 97,
						foldCount: 3,
						meanBefore: 2.5,
						meanAfter: 2.1,
						medianBefore: 2.2,
						folds: [{ meanImprovement: 0.3 }, { meanImprovement: 0.5 }, { meanImprovement: null }]
					}
				}
			},
			{ id: 'rig-b', statistics: null }
		]
	});
	expect(figures[0]).toEqual({
		id: 'rig-a',
		support: 'Sufficient cross-source support',
		products: 21,
		sources: 4,
		pairs: 97,
		folds: 3,
		before: 2.5,
		after: 2.1,
		medianBefore: 2.2,
		improvements: [0.3, 0.5]
	});
	expect(figures[1]).toMatchObject({
		pairs: null,
		before: null,
		after: null,
		medianBefore: null,
		improvements: []
	});
	expect(() => validationFigures({})).toThrow('partition metadata');
});
