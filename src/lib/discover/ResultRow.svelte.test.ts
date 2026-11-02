import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CandidateInfo } from '#core/atlas/types.ts';
import ResultRow from './ResultRow.svelte';
import '#lib/styles/app.css';

test('shows actual dB distance, verbatim tuning, attributed price and product-id actions', async () => {
	const candidate: CandidateInfo = {
		id: 'candidate',
		product: { id: 'product-b', brand: 'Brand', model: 'Model', form: 'iem' },
		kind: 'tuning',
		variantLabel: 'Switch 1 OFF / 2 ON',
		measurementIds: [],
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
		.toHaveAttribute('href', '/compare?p=product-a,product-b');
	await screen.getByRole('button', { name: 'Show on chart' }).click();
	expect(onshow).toHaveBeenCalledOnce();
	await screen.rerender({ selected: true, limitReached: true });
	await expect.element(screen.getByRole('button', { name: 'Remove from chart' })).not.toBeDisabled();
});
