import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { GRID_SIZE } from '#core/grid.ts';
import type { FrSeries } from '#lib/chart.ts';
import FrChart from './FrChart.svelte';
import '#lib/styles/app.css';

const series: FrSeries[] = [
	{
		id: 'a',
		label: 'Curve A',
		values: new Float64Array(GRID_SIZE).fill(7),
		lo: new Float64Array(GRID_SIZE).fill(6),
		hi: new Float64Array(GRID_SIZE).fill(8)
	},
	{ id: 'b', label: 'Curve B', values: new Float32Array(GRID_SIZE).fill(-3) },
	{ id: 'ref', label: 'Reference', values: new Float64Array(GRID_SIZE).fill(2), reference: true }
];

test('explains how to start without pretending a curve is loaded', async () => {
	const screen = await render(FrChart);
	await expect
		.element(screen.getByText('No curve yet — pick an IEM to see its measured response.', { exact: true }))
		.toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Export chart as PNG' })).toBeDisabled();
	await expect.element(screen.getByRole('link', { name: 'Sources and limitations' })).toBeVisible();
	expect(screen.container.querySelectorAll('canvas')).toHaveLength(1);
});

test('renders all series and an accessible octave-resolution table', async () => {
	const screen = await render(FrChart, { series });
	await expect.element(screen.getByRole('figure', { name: 'Frequency response' })).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Hide Curve A' })).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Hide Curve B' })).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Hide Reference' })).toBeVisible();
	expect(
		[...screen.container.querySelectorAll('.legend-row line')].map((line) =>
			line.getAttribute('stroke-dasharray')
		)
	).toEqual(['', '14 5', '3 3 3 8']);
	expect(screen.container.querySelectorAll('canvas')).toHaveLength(1);
	await expect
		.element(screen.getByRole('link', { name: 'Sources and limitations' }))
		.toHaveAttribute('href', '/method');
	await screen.getByText('View chart data', { exact: true }).click();
	await expect.element(screen.getByRole('table')).toBeVisible();
	await expect
		.element(screen.getByRole('columnheader', { name: 'Frequency (Hz)', exact: true }))
		.toBeVisible();
	await expect.element(screen.getByText('Level (dB)', { exact: true })).toBeVisible();
	await expect.element(screen.getByRole('columnheader', { name: 'Curve A' })).toBeVisible();
	await expect.element(screen.getByRole('rowheader', { name: '20 Hz', exact: true })).toBeVisible();
	expect(screen.container.querySelectorAll('tbody tr')).toHaveLength(10);
});

test('subtracts the selected baseline and toggles series without removing table data', async () => {
	const screen = await render(FrChart, { series, baselineId: 'ref' });
	await screen.getByRole('radio', { name: 'Difference', exact: true }).click();
	await expect.element(screen.getByRole('combobox', { name: 'Difference baseline' })).toHaveValue('ref');
	await screen.getByText('View chart data', { exact: true }).click();
	const firstRow = screen.container.querySelector('tbody tr');
	expect(firstRow?.textContent).toBe('20 Hz+5.0-5.00.0');
	await screen.getByRole('button', { name: 'Hide Curve A' }).click();
	await expect
		.element(screen.getByRole('button', { name: 'Show Curve A' }))
		.toHaveAttribute('aria-pressed', 'false');
	await expect.element(screen.getByRole('columnheader', { name: 'Curve A' })).toBeVisible();
});

test('supports keyboard frequency inspection and focusable region descriptions', async () => {
	const screen = await render(FrChart, { series, regions: true });
	const scrubber = screen.getByRole('slider', { name: 'Inspect frequency' });
	await scrubber.click();
	await userEvent.keyboard('{Home}');
	await expect.element(scrubber).toHaveAttribute('aria-valuetext', '20 hertz');
	const treble = screen.getByRole('button', { name: 'Treble, 5000 to 10000 Hz', exact: true });
	await treble.click();
	await expect
		.element(screen.getByText(/Insertion depth can strongly change measurements here/))
		.toBeVisible();
	await userEvent.keyboard('{Escape}');
	await expect.element(screen.getByText(/Hover or focus a region/)).toBeVisible();
});

test('keeps missing samples missing and rejects the wrong grid', async () => {
	const values = new Float64Array(GRID_SIZE).fill(NaN);
	const screen = await render(FrChart, { series: [{ id: 'gap', label: 'Missing coverage', values }] });
	await screen.getByText('View chart data', { exact: true }).click();
	expect(screen.container.querySelector('tbody td')?.textContent).toBe('—');
	await screen.rerender({ series: [{ id: 'invalid', label: 'Wrong grid', values: new Float32Array(5) }] });
	await expect
		.element(screen.getByText(/every curve and uncertainty bound must use the 240-point/))
		.toBeVisible();
});
