import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CompareResult, SimilarResult } from '#core/atlas/types.ts';
import { GRID } from '#core/grid.ts';
import type { DisplayCurve } from './display.ts';
import ChartPanel from './ChartPanel.svelte';

const display = vi.hoisted(() => ({ displayCurve: vi.fn(), candidateCurve: vi.fn() }));
vi.mock('./display.ts', () => display);

const similar: SimilarResult = {
	ok: true,
	partition: 'iem-711',
	harmonised: false,
	sourceMode: 'only',
	rankFrequencies: GRID,
	rankWeights: new Float64Array(GRID.length).fill(1),
	treblePenalty: 1,
	reference: {
		productId: 'ref',
		uploadId: null,
		measurementIds: ['a', 'b'],
		sources: [],
		rankCurve: new Float64Array(GRID.length).fill(80)
	},
	results: [],
	caveats: []
};

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

test('leaving detail while a fetch is pending clears loading and ignores the late result', async () => {
	let release: (value: DisplayCurve) => void = () => {};
	display.displayCurve.mockImplementationOnce(
		() =>
			new Promise<DisplayCurve>((resolve) => {
				release = resolve;
			})
	);
	const screen = await render(ChartPanel, {
		result: { kind: 'similar', data: similar },
		overlays: [],
		nameFor: (id: string) => id
	});
	await screen.getByRole('radio', { name: 'Detail measurements', exact: true }).click();
	await expect.element(screen.getByText('Loading detail measurements…', { exact: true })).toBeVisible();
	expect(display.displayCurve).toHaveBeenLastCalledWith('ref', 'iem-711', {
		id: 'detail-reference-0',
		reference: true,
		measurementIds: ['a', 'b']
	});
	await screen.getByRole('radio', { name: 'As ranked', exact: true }).click();
	await expect
		.element(screen.getByText('Loading detail measurements…', { exact: true }))
		.not.toBeInTheDocument();
	release({
		series: { id: 'late', label: 'Late detail', values: new Float64Array(GRID.length) },
		sources: []
	});
	await expect.element(screen.getByRole('figure', { name: 'Frequency response', exact: true })).toBeVisible();
	await expect.element(screen.getByText('Late detail', { exact: true })).not.toBeInTheDocument();
});

test('detail retains an uploaded reference and uses it as the Difference baseline', async () => {
	const upload = {
		id: 'upload-1',
		label: 'Your local measurement',
		values: new Float64Array(GRID.length).fill(7)
	};
	const screen = await render(ChartPanel, {
		result: {
			kind: 'similar',
			data: {
				...similar,
				reference: { ...similar.reference, productId: null, uploadId: upload.id, measurementIds: [] }
			}
		},
		overlays: [],
		localReference: upload,
		nameFor: (id: string) => id
	});
	await screen.getByRole('radio', { name: 'Detail measurements', exact: true }).click();
	await expect
		.element(screen.getByRole('button', { name: /Your local measurement.*Reference/ }))
		.toBeVisible();
	await screen.getByRole('radio', { name: 'Difference', exact: true }).click();
	await expect.element(screen.getByRole('combobox', { name: 'Difference baseline' })).toHaveValue(upload.id);
});

test('detail errors do not leak back into the ranked view', async () => {
	display.displayCurve.mockRejectedValueOnce(new Error('Fixture detail failure'));
	const screen = await render(ChartPanel, {
		result: { kind: 'similar', data: similar },
		overlays: [],
		nameFor: (id: string) => id
	});
	await screen.getByRole('radio', { name: 'Detail measurements', exact: true }).click();
	await expect.element(screen.getByText('Fixture detail failure', { exact: true })).toBeVisible();
	await screen.getByRole('radio', { name: 'As ranked', exact: true }).click();
	await expect.element(screen.getByText('Fixture detail failure', { exact: true })).not.toBeInTheDocument();
});
