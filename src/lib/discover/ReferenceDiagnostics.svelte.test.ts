import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { MeasurementInfo, ProductListItem } from '#core/atlas/types.ts';
import ReferenceDiagnostics from './ReferenceDiagnostics.svelte';

const service = vi.hoisted(() => ({ measurements: vi.fn<(ids: string[]) => Promise<MeasurementInfo[]>>() }));
vi.mock('#lib/atlas.ts', () => ({ analysis: () => Promise.resolve(service) }));

const product: ProductListItem = {
	id: 'p',
	brand: 'Fixture',
	model: 'Reference',
	partitions: ['iem-711'],
	defaultPartitions: [],
	sourceCount: 1,
	measurementCount: 1,
	variantLabels: [],
	priceUsd: null,
	prices: []
};
const item = {
	productId: 'p',
	rating: 'dislike' as const,
	strength: 1,
	soundRelated: true,
	measurementId: 'm'
};
const measurement: MeasurementInfo = {
	id: 'm',
	productId: 'p',
	brand: 'Fixture',
	model: 'Reference',
	partition: 'iem-711',
	sourceId: 's',
	sourceName: 'Reviewer',
	variantLabel: 'Variant',
	variantKind: 'tuning'
};

test('reports a failed dislike reference, clears stale errors on rating reload and never substitutes defaults', async () => {
	service.measurements
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValueOnce([measurement])
		.mockResolvedValueOnce([]);
	const screen = await render(ReferenceDiagnostics, {
		items: [item],
		products: [product],
		partition: 'iem-711',
		sources: []
	});
	await expect.element(screen.getByText(/Variant metadata could not be loaded/)).toBeVisible();
	await expect.element(screen.getByText(/the selected measurement is not available/)).toBeVisible();
	await screen.rerender({ items: [{ ...item, rating: 'like', strength: 0.6 }] });
	await expect.element(screen.getByText(/Available on 711-family coupler/)).toBeVisible();
	await expect.element(screen.getByText(/Variant metadata could not be loaded/)).not.toBeInTheDocument();
	await screen.rerender({
		items: [{ productId: 'p', rating: 'like', strength: 0.6, soundRelated: true }],
		partition: ''
	});
	await expect.element(screen.getByText(/No eligible default measurements/)).toBeVisible();
	await expect.element(screen.getByText(/Available on/)).not.toBeInTheDocument();
});

test('an aborted metadata request cannot overwrite the newer rating state', async () => {
	let release: (rows: MeasurementInfo[]) => void = () => {};
	service.measurements
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				})
		)
		.mockResolvedValueOnce([]);
	const screen = await render(ReferenceDiagnostics, {
		items: [item],
		products: [product],
		partition: 'iem-711',
		sources: []
	});
	await expect.element(screen.getByText('Checking reference measurements…', { exact: true })).toBeVisible();
	await screen.rerender({ items: [{ ...item, measurementId: 'new' }] });
	await expect.element(screen.getByText(/the selected measurement is not available/)).toBeVisible();
	release([measurement]);
	await expect.element(screen.getByText(/selected variant new/)).toBeVisible();
	await expect.element(screen.getByText(/Available on/)).not.toBeInTheDocument();
});
