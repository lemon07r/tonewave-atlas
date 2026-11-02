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

test('rating an existing row retains preferences, and duplicate reference labels render independently', async () => {
	const candidate: CandidateInfo = {
		id: 'c',
		product: { id: 'p', brand: 'Fixture', model: 'One', form: 'iem' },
		kind: 'default',
		variantLabel: null,
		measurementIds: [],
		sources: [],
		prices: [],
		priceUsd: null
	};
	const existing = {
		productId: 'p',
		rating: 'like' as const,
		strength: 0.6,
		soundRelated: false,
		likedAspects: ['bass' as const],
		dislikeReasons: ['other' as const],
		measurementId: 'explicit'
	};
	const onrate = vi.fn();
	const bands = [{ band: 'bass' as const, meanDb: 1, rmsDb: 1, contribution: 1, coverage: 1 }];
	const screen = await render(ResultRow, {
		candidate,
		existing,
		rank: 1,
		distance: NaN,
		bands: [],
		tradeoff: { distances: [null, 1], offsets: [null, 0], mean: null, minimax: null, pareto: false },
		referenceNames: ['Same name', 'Same name'],
		referenceEvidence: [
			{ label: 'Same name', bands },
			{ label: 'Same name', bands }
		],
		onshow: vi.fn(),
		onrate
	});
	await expect
		.element(screen.getByText(/No trade-off ranking: at least one reference has insufficient overlap/))
		.toBeVisible();
	expect(screen.container.querySelectorAll('thead th[scope="col"]')).toHaveLength(12);
	await screen.getByText('Rate this product', { exact: true }).click();
	await screen.getByRole('button', { name: 'Save rating', exact: true }).click();
	expect(onrate).toHaveBeenCalledExactlyOnceWith(existing);
});

test('keeps small reference and band headers readable with normal tracking and explicit kerning', async () => {
	const screen = await render(ResultRow, {
		candidate: {
			id: 'candidate',
			product: { id: 'studio-4', brand: 'Softears', model: 'Studio 4', form: 'iem' },
			kind: 'default',
			variantLabel: null,
			measurementIds: [],
			sources: [],
			prices: [],
			priceUsd: null
		},
		rank: 1,
		distance: 0.8,
		bands: [{ band: 'sub-bass', meanDb: 1, rmsDb: 1, contribution: 0.3, coverage: 1 }],
		tradeoff: { distances: [0.76, 0.84], offsets: [0, 0], mean: 0.8, minimax: 0.84, pareto: true },
		referenceNames: ['CrinEar Reference', 'Softears Volume S'],
		onshow: vi.fn()
	});
	const headers = screen.container.querySelectorAll('.data-table th');
	expect([...headers].map((header) => header.firstChild?.textContent)).toContain('Softears Volume S');
	expect([...headers].map((header) => header.textContent)).toContain('sub-bass');
	for (const header of headers) {
		const style = getComputedStyle(header);
		expect(style.letterSpacing).toBe('normal');
		expect(style.fontKerning).toBe('normal');
		expect(Number.parseFloat(style.fontSize)).toBeGreaterThanOrEqual(12);
	}
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
	await expect
		.element(screen.getByText('$129 reviewer-listed price (Reviewer, seen Nov 2026; listing date unknown)'))
		.toBeVisible();
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
		.element(screen.getByText('Taste ranking score: 3.2 score · Response distance: 1.4 dB', { exact: true }))
		.toBeVisible();
	await expect.element(screen.getByText('Measured by 1 reviewer', { exact: true })).toBeVisible();
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
