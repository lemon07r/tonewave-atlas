import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DiscoverySearch from './DiscoverySearch.svelte';
import '#lib/styles/app.css';

test('offers single-reference and taste-profile discovery upfront with native radio navigation', async () => {
	const screen = await render(DiscoverySearch);
	await expect.element(screen.getByRole('radio', { name: 'Similar to one IEM', exact: true })).toBeChecked();
	await expect.element(screen.getByRole('combobox', { name: 'An IEM you enjoy' })).toBeVisible();
	await screen.getByRole('radio', { name: 'Similar to one IEM', exact: true }).click();
	await userEvent.keyboard('{ArrowRight}');
	await expect
		.element(screen.getByRole('radio', { name: 'Match my taste profile', exact: true }))
		.toBeChecked();
	await expect.element(screen.getByRole('region', { name: 'Your taste profile' })).toBeVisible();
	await expect.element(screen.getByRole('combobox', { name: 'Add an IEM to your profile' })).toBeVisible();
	await expect.element(screen.getByRole('radio', { name: 'Love', exact: true })).toBeDisabled();
	await expect.element(screen.getByRole('checkbox', { name: 'Bass weight' })).toBeDisabled();
	await expect.element(screen.getByText('No IEMs in your profile yet.')).toBeVisible();
});

test('keeps headphone copy honest and exposes the unavailable catalog', async () => {
	const screen = await render(DiscoverySearch, { headphones: true });
	await screen.getByRole('radio', { name: 'Match my taste profile', exact: true }).click();
	await expect.element(screen.getByText('No headphones in your profile yet.')).toBeVisible();
	await screen.getByRole('combobox', { name: 'Add a headphone to your profile' }).click();
	await expect
		.element(screen.getByRole('status'))
		.toHaveTextContent(
			'The measurement catalog is not connected yet. No products can be added in this preview.'
		);
});
