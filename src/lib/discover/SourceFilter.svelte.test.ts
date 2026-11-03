import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SourceFilter from './SourceFilter.svelte';
import type { AtlasSummary } from '#core/atlas/types.ts';
import { sourceInForm, type SourceMembership } from '#lib/sources.ts';

test('offers explicit coverage and source-only scoring without changing reviewer selection', async () => {
	const onmodechange = vi.fn(),
		onchange = vi.fn();
	const screen = await render(SourceFilter, {
		sources: [],
		selected: ['reviewer-a'],
		mode: 'coverage',
		onchange,
		onmodechange
	});
	await expect
		.element(
			screen.getByText(
				'1 selected · products must be measured by a selected reviewer; reference and candidate curves use all eligible sources.',
				{ exact: true }
			)
		)
		.toBeVisible();
	await expect.element(screen.getByText(/1 selected reviewer is outside this rig’s list/)).toBeVisible();
	await screen.getByRole('combobox', { name: 'Reviewer scoring mode' }).selectOptions('only');
	expect(onmodechange).toHaveBeenCalledExactlyOnceWith('only');
	expect(onchange).not.toHaveBeenCalled();
	await screen.rerender({ selected: ['reviewer-a', 'reviewer-b'] });
	await expect.element(screen.getByText(/2 selected reviewers are outside this rig’s list/)).toBeVisible();
});

test('source-only scoring is disabled until a reviewer is selected', async () => {
	const screen = await render(SourceFilter, {
		sources: [],
		selected: [],
		mode: 'coverage',
		onchange: vi.fn(),
		onmodechange: vi.fn()
	});
	expect(screen.container.querySelector<HTMLOptionElement>('option[value="only"]')?.disabled).toBe(true);
});

for (const form of ['iem', 'headphone'] as const) {
	test(`a mixed reviewer remains selectable on its ${form} membership, not just its primary rig`, async () => {
		const source: AtlasSummary['sources'][number] & SourceMembership = {
			id: 'mixed',
			username: 'mixed',
			name: 'Mixed Reviewer',
			url: 'https://example.org',
			dbType: 'squig',
			form: 'iem',
			partition: 'iem-711',
			forms: ['iem', 'headphone'],
			partitions: ['iem-711', 'headphone-5128'],
			rig: null,
			rigInferred: false,
			permission: 'public, not explicitly licensed',
			crawledAt: '2026-11-02',
			calibration: null,
			measurementCount: 2
		};
		const partition = form === 'iem' ? 'iem-711' : 'headphone-5128';
		const onchange = vi.fn();
		const screen = await render(SourceFilter, {
			sources: [source].filter((s) => sourceInForm(s, form)),
			partition,
			partitions: [partition],
			selected: [],
			mode: 'coverage',
			onchange,
			onmodechange: vi.fn()
		});
		await screen.getByRole('checkbox', { name: 'Mixed Reviewer', exact: true }).click();
		expect(onchange).toHaveBeenCalledExactlyOnceWith(['mixed']);
		expect(screen.container.querySelectorAll('fieldset')).toHaveLength(1);
		expect(screen.container.querySelector('legend')?.textContent).toBe(
			form === 'iem' ? '711-family coupler' : 'B&K 5128'
		);
	});
}
