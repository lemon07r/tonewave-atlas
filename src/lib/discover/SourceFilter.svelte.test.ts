import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SourceFilter from './SourceFilter.svelte';

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
	await screen.getByRole('combobox', { name: 'Reviewer scoring mode' }).selectOptions('only');
	expect(onmodechange).toHaveBeenCalledExactlyOnceWith('only');
	expect(onchange).not.toHaveBeenCalled();
});
