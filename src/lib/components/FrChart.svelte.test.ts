import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { GRID, GRID_SIZE } from '#core/grid.ts';
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
	await expect.element(screen.getByRole('button', { name: /^1\s*Curve A$/ })).toBeVisible();
	await expect.element(screen.getByRole('button', { name: /^2\s*Curve B$/ })).toBeVisible();
	await expect.element(screen.getByRole('button', { name: /^3\s*Reference\s*Reference$/ })).toBeVisible();
	expect(
		[...screen.container.querySelectorAll('.legend-row line')].map((line) =>
			line.getAttribute('stroke-dasharray')
		)
	).toEqual(['', '14 5', '4 4']);
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
	await screen.getByRole('button', { name: /^1\s*Curve A$/ }).click();
	await expect
		.element(screen.getByRole('button', { name: /^1\s*Curve A$/ }))
		.toHaveAttribute('aria-pressed', 'false');
	await expect.element(screen.getByRole('columnheader', { name: 'Curve A' })).toBeVisible();
});

test('keeps the canvas through legend, data, regions, mode and theme updates; rebuilds for a new series identity', async () => {
	const screen = await render(FrChart, { series });
	const canvas = screen.container.querySelector('canvas');
	if (!canvas) throw new Error('Plot canvas missing');
	const original = canvas.toDataURL();
	await screen.getByRole('button', { name: /^1\s*Curve A$/ }).click();
	expect(screen.container.querySelector('canvas')).toBe(canvas);
	expect(canvas.toDataURL()).not.toBe(original);
	const hidden = canvas.toDataURL();
	await screen.rerender({
		series: series.map((curve) =>
			curve.id === 'b' ? { ...curve, values: new Float64Array(GRID_SIZE).fill(4) } : curve
		)
	});
	expect(screen.container.querySelector('canvas')).toBe(canvas);
	expect(canvas.toDataURL()).not.toBe(hidden);
	await screen.getByText('View chart data', { exact: true }).click();
	expect(screen.container.querySelector('tbody tr')?.textContent).toBe('20 Hz7.04.02.0');
	await screen.getByRole('switch', { name: 'Regions', exact: true }).click();
	expect(screen.container.querySelector('canvas')).toBe(canvas);
	await screen.getByRole('radio', { name: 'Difference', exact: true }).click();
	expect(screen.container.querySelector('canvas')).toBe(canvas);
	const light = canvas.toDataURL();
	const previousTheme = document.documentElement.dataset.theme;
	try {
		document.documentElement.dataset.theme = 'dark';
		await expect.poll(() => canvas.toDataURL()).not.toBe(light);
		expect(screen.container.querySelector('canvas')).toBe(canvas);
	} finally {
		if (previousTheme) document.documentElement.dataset.theme = previousTheme;
		else delete document.documentElement.dataset.theme;
	}
	await screen.rerender({
		series: [{ id: 'new', label: 'New identity', values: new Float64Array(GRID_SIZE) }]
	});
	expect(screen.container.querySelector('canvas')).not.toBe(canvas);
});

test('supports keyboard frequency inspection and focusable region descriptions', async () => {
	const screen = await render(FrChart, { series, regions: true });
	const scrubber = screen.getByRole('slider', { name: 'Inspect frequency' });
	await scrubber.click();
	await userEvent.keyboard('{Home}');
	await expect.element(scrubber).toHaveAttribute('aria-valuetext', '20 hertz');
	const treble = screen.getByRole('button', { name: 'Treble, 5000 to 10000 Hz', exact: true });
	await expect.element(treble).not.toHaveAttribute('aria-pressed');
	await treble.click();
	await expect
		.element(screen.getByText(/Insertion depth can strongly change measurements here/))
		.toBeVisible();
	await userEvent.keyboard('{Escape}');
	await expect.element(screen.getByText(/Hover or focus a region/)).toBeVisible();
});

test('starts near 1 kHz and retains the chosen frequency when series and grids change', async () => {
	const screen = await render(FrChart, { series });
	const scrubber = screen.container.querySelector<HTMLInputElement>('.frequency-scrubber');
	if (!scrubber) throw new Error('Frequency scrubber missing');
	expect(Math.abs((GRID[Number(scrubber.value)] ?? 0) - 1000)).toBeLessThan(20);
	scrubber.value = '144';
	scrubber.dispatchEvent(new Event('input', { bubbles: true }));
	await screen.rerender({ series: [...series.slice(0, 1)] });
	await expect.element(screen.getByText('1280 Hz', { exact: true })).toBeVisible();
	await screen.rerender({
		frequencies: new Float64Array([20, 1000, 1280, 20000]),
		series: [{ id: 'new', label: 'New grid', values: new Float64Array(4) }]
	});
	await expect
		.element(screen.getByRole('slider', { name: 'Inspect frequency' }))
		.toHaveAttribute('aria-valuetext', '1280 hertz');
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
	const summary = screen.container.querySelector('.fr-chart')?.getAttribute('aria-describedby');
	if (!summary) throw new Error('Chart summary missing');
	expect(document.getElementById(summary)?.textContent).not.toContain('A data table is available');
	expect(document.getElementById(summary)?.textContent).toContain('unavailable');
});

test.each(['lo', 'hi'] as const)(
	'rejects a one-sided %s envelope instead of silently dropping it',
	async (side) => {
		const screen = await render(FrChart, {
			series: [
				{
					id: 'partial',
					label: 'Partial',
					values: new Float64Array(GRID_SIZE),
					[side]: new Float64Array(GRID_SIZE)
				}
			]
		});
		await expect
			.element(screen.getByText(/lower and upper uncertainty bounds must be supplied together/i))
			.toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Export chart as PNG' })).toBeDisabled();
	}
);

test('readout distinguishes neighbouring grid samples that share an axis label', async () => {
	const screen = await render(FrChart, { series });
	const scrubber = screen.container.querySelector<HTMLInputElement>('.frequency-scrubber');
	if (!scrubber) throw new Error('Frequency scrubber missing');
	scrubber.value = '144';
	scrubber.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.element(screen.getByText('1280 Hz', { exact: true })).toBeVisible();
	scrubber.value = '145';
	scrubber.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.element(screen.getByText('1318 Hz', { exact: true })).toBeVisible();
});

test('multiple references use distinct dash and colour slots in the legend', async () => {
	const screen = await render(FrChart, { series: series.map((item) => ({ ...item, reference: true })) });
	const lines = [...screen.container.querySelectorAll('.legend-row line')];
	expect(lines.map((line) => line.getAttribute('stroke-dasharray'))).toEqual(['', '14 5', '4 4']);
	expect(lines.map((line) => line.getAttribute('stroke'))).toEqual([
		'var(--curve-1)',
		'var(--curve-2)',
		'var(--curve-3)'
	]);
});

test('styles remain distinct when seven colours wrap and the reference marker is announced', async () => {
	const curves = Array.from({ length: 9 }, (_, i) => ({
		id: String(i),
		label: `Curve ${i}`,
		values: new Float64Array(GRID_SIZE),
		reference: i === 0
	}));
	const screen = await render(FrChart, { series: curves });
	await expect.element(screen.getByRole('button', { name: /^1\s*Curve 0\s*Reference$/ })).toBeVisible();
	const lines = [...screen.container.querySelectorAll('.legend-row line')];
	const styles = lines.map(
		(line) => `${line.getAttribute('stroke')}:${line.getAttribute('stroke-dasharray')}`
	);
	expect(new Set(styles).size).toBe(9);
});

test.each([[], [20], [20, NaN], [20, 20], [40, 20], [0, 20]])(
	'identifies an invalid frequency grid %j separately from invalid curves',
	async (...points) => {
		const frequencies = new Float64Array(points);
		const screen = await render(FrChart, { frequencies, series: [] });
		await expect
			.element(
				screen.getByText(
					/frequency grid must be finite, positive and strictly increasing with at least two points/
				)
			)
			.toBeVisible();
	}
);
