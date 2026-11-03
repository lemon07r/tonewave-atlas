import { expect, test, vi } from 'vitest';
import { GRID } from '#core/grid.ts';
import { candidateCurve, displayCurve } from './display.ts';

const service = vi.hoisted(() => ({ productDetail: vi.fn(), curves: vi.fn() }));
vi.mock('#lib/atlas.ts', () => ({ analysis: () => Promise.resolve(service) }));

test('pools the exact reference and candidate measurements, never the all-reviewer consensus', async () => {
	const all = new Float64Array(GRID.length).fill(999);
	service.productDetail.mockResolvedValue({
		ok: true,
		product: { id: 'p', brand: 'Fixture', model: 'One', form: 'iem', measurementIds: ['a', 'b', 'excluded'] },
		frequencies: GRID,
		measurements: [],
		spread: [{ partition: 'iem-711', measurementIds: ['a', 'b', 'excluded'], centre: all }],
		variationSpread: []
	});
	service.curves.mockImplementation((ids: string[]) =>
		Promise.resolve(ids.map((id, i) => ({ id, values: new Float64Array(GRID.length).fill(80 + 10 * i) })))
	);
	const curve = await displayCurve('p', 'iem-711', {
		id: 'ref',
		reference: true,
		measurementIds: ['a', 'b']
	});
	expect(service.curves).toHaveBeenLastCalledWith(['a', 'b'], { channel: 'avg' });
	for (const value of curve.series.values) expect(value).toBeCloseTo(80, 10);
	await candidateCurve(
		{
			id: 'c',
			product: { id: 'p', brand: 'Fixture', model: 'One', form: 'iem' },
			kind: 'default',
			variantLabel: null,
			measurementIds: ['b'],
			sources: [],
			prices: [],
			priceUsd: null
		},
		'iem-711'
	);
	expect(service.curves).toHaveBeenLastCalledWith(['b'], { channel: 'avg' });
});
