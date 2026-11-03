import { test } from '@playwright/test';
import { expectTradeoffRows } from './tradeoffs.ts';

for (const sort of ['mean', 'minimax'] as const) {
	test(`trade-off evidence assertions handle partial coverage with ${sort} sorting`, async ({ page }) => {
		await page.setContent(`<label>Trade-off sort<select><option value="${sort}">Selected sort</option></select></label>
		<section aria-label="Measured matches" aria-busy="false"><ol>
		<li class="result-row"><div class="tradeoff"><table><thead><tr><th>First<span class="extreme">closest</span></th><th>Second<span class="extreme">furthest</span></th></tr></thead><tbody><tr><td>1.0</td><td>3.0</td></tr></tbody></table></div><p class="distance">Overall distance: ${sort === 'mean' ? '2.0' : '3.0'} dB</p></li>
		<li class="result-row"><div class="tradeoff"><table><thead><tr><th>First<span class="extreme">No coverage</span></th><th>Second<span class="extreme"></span></th></tr></thead><tbody><tr><td>—</td><td>3.0</td></tr></tbody></table></div><p class="distance">Overall distance: — dB</p></li>
		</ol></section>`);
		await expectTradeoffRows(page, ['First', 'Second'], sort);
	});
}
