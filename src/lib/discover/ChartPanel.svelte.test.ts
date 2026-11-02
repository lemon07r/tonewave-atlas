import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CompareResult } from '#core/atlas/types.ts';
import ChartPanel from './ChartPanel.svelte';

test('separates overlays by returned alignment reference and excludes null alignment from Difference', async () => {
	const candidate = {
		id: 'match',
		product: { id: 'p', brand: 'Brand', model: 'Match', form: 'iem' as const },
		kind: 'default' as const,
		variantLabel: null,
		measurementIds: [],
		sources: [],
		prices: [],
		priceUsd: null
	};
	const result: CompareResult = {
		ok: true,
		partition: 'iem-711',
		harmonised: false,
		sourceMode: 'coverage',
		rankFrequencies: new Float64Array([20, 1000, 20000]),
		rankWeights: new Float64Array([1, 1, 1]),
		treblePenalty: 1,
		references: ['First', 'Second'].map((productId) => ({
			productId,
			uploadId: null,
			measurementIds: [],
			sources: [],
			rankCurve: new Float64Array([1, 2, 3])
		})),
		results: [0, 1, null].map((alignedTo, index) => ({
			candidate: {
				...candidate,
				id: `match-${index}`,
				product: { ...candidate.product, model: `Match ${index}` }
			},
			alignedTo,
			offsetDb: 0,
			rankCurve: new Float64Array([2, 3, 4]),
			tradeoff: { distances: [1, 1], offsets: [0, 0], mean: 1, minimax: 1, pareto: true }
		})),
		counts: { candidates: 3, pareto: 3 },
		caveats: []
	};
	const screen = await render(ChartPanel, {
		result: { kind: 'compare', data: result },
		overlays: ['match-0', 'match-1', 'match-2'],
		nameFor: (id: string) => id
	});
	expect(screen.container.querySelectorAll('.fr-chart')).toHaveLength(2);
	const charts = screen.container.querySelectorAll('.fr-chart');
	expect(charts[0]?.textContent).toContain('Match 0');
	expect(charts[0]?.textContent).not.toContain('Match 1');
	expect(charts[1]?.textContent).toContain('Match 1');
	for (const chart of charts) expect(chart.textContent).not.toContain('Match 2');
	const switches = screen.getByRole('radio', { name: 'Difference', exact: true });
	for (const control of switches.all()) await control.click();
	const baselines = [...screen.container.querySelectorAll<HTMLSelectElement>('.baseline-label select')];
	expect(baselines.map((select) => select.value)).toEqual(['reference-0', 'reference-1']);
	for (const chart of charts) expect(chart.textContent).not.toContain('Match 2');
});
