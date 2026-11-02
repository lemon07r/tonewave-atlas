import { expect, type Page } from '@playwright/test';

function tenths(text: string): number {
	expect(text).toMatch(/^\d+\.\d$/);
	return Number(text.replace('.', ''));
}

/** Check the displayed evidence, without assuming a particular catalog or ranking winner. */
export async function expectTradeoffRows(
	page: Page,
	referenceNames: readonly string[],
	sort: 'mean' | 'minimax'
): Promise<void> {
	await expect(page.getByRole('combobox', { name: 'Trade-off sort', exact: true })).toHaveValue(sort);
	await expect(page.getByRole('region', { name: 'Measured matches', exact: true })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	const rows = await page.locator('.result-row').evaluateAll((elements) =>
		elements.map((row) => ({
			headers: [...row.querySelectorAll('.tradeoff th')].map(
				(header) => header.firstChild?.textContent?.trim() ?? ''
			),
			cells: [...row.querySelectorAll('.tradeoff td')].map((cell) => cell.textContent.trim()),
			labels: [...row.querySelectorAll('.tradeoff .extreme')].map((label) => label.textContent.trim()),
			score: row.querySelector('.distance')?.textContent.trim() ?? ''
		}))
	);
	expect(rows.length).toBeGreaterThan(0);
	const scores: number[] = [];
	for (const row of rows) {
		expect(row.headers).toEqual(referenceNames);
		expect(row.cells).toHaveLength(referenceNames.length);
		const distances = row.cells.map(tenths);
		const closest = Math.min(...distances),
			furthest = Math.max(...distances);
		expect(row.labels).toEqual(
			distances.map((value) =>
				closest === furthest ? '' : value === closest ? 'closest' : value === furthest ? 'furthest' : ''
			)
		);
		expect(row.score).toMatch(/^Overall distance:\s*\d+\.\d\s*dB$/);
		const score = tenths(row.score.replace(/^Overall distance:\s*/, '').replace(/\s*dB$/, ''));
		if (sort === 'minimax') expect(score).toBe(furthest);
		else {
			// Each reference and the overall mean round independently to 0.1 dB. Their
			// rounding intervals must overlap; integer tenths avoid a floating-point epsilon.
			const sum = distances.reduce((total, value) => total + value, 0);
			expect(Math.abs(score * distances.length - sum)).toBeLessThan(distances.length);
		}
		scores.push(score);
	}
	expect(scores).toEqual([...scores].sort((a, b) => a - b));
}
