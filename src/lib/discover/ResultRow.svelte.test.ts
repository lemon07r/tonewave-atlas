import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CandidateInfo, ProductDetail } from '#core/atlas/types.ts';
import ResultRow from './ResultRow.svelte';
import '#lib/styles/app.css';

const rpc = vi.hoisted(() => ({ productDetail: vi.fn<() => Promise<ProductDetail>>() }));
vi.mock('#lib/atlas.ts', () => {
	const worker = Promise.resolve(rpc);
	return { analysis: () => worker };
});

test('preserves tuning/form actions, visible ranking score and source links through retry', async () => {
	const candidate: CandidateInfo = {
		id: 'candidate',
		product: { id: 'product-b', brand: 'Brand', model: 'Model', form: 'iem' },
		kind: 'tuning',
		variantLabel: 'Switch 1 OFF / 2 ON',
		measurementIds: ['tuning-measurement'],
		sources: [
			{
				id: 'db',
				name: 'Reviewer',
				username: 'reviewer',
				url: 'https://example.com',
				dbType: 'squig',
				form: 'iem',
				partition: 'iem-711',
				rig: null,
				rigInferred: true,
				permission: 'public, not explicitly licensed',
				crawledAt: '2026-11-01',
				calibration: null
			}
		],
		prices: [{ raw: '$129', usd: 129, sourceId: 'db', crawledAt: '2026-11-01' }],
		priceUsd: [129, 129]
	};
	const onshow = vi.fn();
	const screen = await render(ResultRow, {
		candidate,
		rank: 1,
		distance: 1.37,
		bands: [{ band: 'sub-bass', meanDb: 2.5, rmsDb: 2.6, contribution: 0.5, coverage: 1 }],
		referenceProductId: 'product-a',
		onshow
	});
	await expect.element(screen.getByText('Response distance: 1.4 dB', { exact: true })).toBeVisible();
	await expect.element(screen.getByText(/Switch 1 OFF \/ 2 ON/)).toBeVisible();
	await expect.element(screen.getByText('More sub-bass', { exact: true })).toBeVisible();
	await expect.element(screen.getByText('$129 listed by Reviewer, Nov 2026')).toBeVisible();
	await expect
		.element(screen.getByRole('link', { name: 'Compare', exact: true }))
		.toHaveAttribute('href', '/compare?p=product-a&m=tuning-measurement');
	await screen.getByRole('button', { name: 'Show on chart' }).click();
	expect(onshow).toHaveBeenCalledOnce();
	await screen.rerender({ selected: true, limitReached: true });
	await expect.element(screen.getByRole('button', { name: 'Remove from chart' })).not.toBeDisabled();
	await screen.rerender({
		candidate: { ...candidate, product: { ...candidate.product, form: 'headphone' } },
		fit: {
			score: 3.2,
			taste: 0,
			fit: 1.2,
			plainDistanceDb: 1.37,
			penalty: 2,
			nearestLiked: null,
			constraints: [],
			bands: [],
			uncertainRegions: []
		}
	});
	await expect
		.element(screen.getByText('Ranking score: 3.2 (not dB; lower is closer; includes dislike penalties)'))
		.toBeVisible();
	await expect
		.element(screen.getByRole('link', { name: 'Compare', exact: true }))
		.toHaveAttribute('href', '/compare?form=headphones&p=product-a&m=tuning-measurement');
	await expect
		.element(screen.getByRole('link', { name: 'Product page', exact: true }))
		.toHaveAttribute('href', '/explore?product=product-b&form=headphones');
	rpc.productDetail.mockRejectedValueOnce(new Error('Detail offline')).mockResolvedValueOnce({
		ok: true,
		product: { ...candidate.product, measurementIds: [] },
		frequencies: new Float64Array(),
		measurements: [],
		spread: [],
		variationSpread: []
	});
	await screen.getByText('Measured differences & sources', { exact: true }).click();
	await expect.element(screen.getByText('Detail offline')).toBeVisible();
	await expect
		.element(screen.getByRole('link', { name: 'Reviewer database' }))
		.toHaveAttribute('href', 'https://example.com');
	await screen.getByText('Measured differences & sources', { exact: true }).click();
	await screen.getByText('Measured differences & sources', { exact: true }).click();
	await expect.poll(() => rpc.productDetail.mock.calls.length).toBe(2);
	await expect.element(screen.getByText('Detail offline')).not.toBeInTheDocument();
});
