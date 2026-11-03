import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DatasetUpdatedError } from '#core/atlas/errors.ts';
import { analysisError, datasetUpdate } from '#lib/analysis/errors.svelte.ts';
import DatasetUpdate from './DatasetUpdate.svelte';

afterEach(() => {
	datasetUpdate.message = '';
});

test('a Comlink dataset update stays polite and persistent and offers Reload instead of a generic error', async () => {
	const onreload = vi.fn();
	const screen = await render(DatasetUpdate, { onreload });
	const updated = new DatasetUpdatedError('old', 'new');
	expect(analysisError({ name: updated.name, message: updated.message })).toBe('');
	await expect
		.element(screen.getByText('The dataset was updated. Reload to continue.', { exact: true }))
		.toHaveTextContent('The dataset was updated. Reload to continue.');
	expect(analysisError(new Error('An unrelated error'))).toBe('An unrelated error');
	await screen.rerender({ onreload });
	await expect.element(screen.getByRole('status')).toBeVisible();
	await screen.getByRole('button', { name: 'Reload', exact: true }).click();
	expect(onreload).toHaveBeenCalledOnce();
});
