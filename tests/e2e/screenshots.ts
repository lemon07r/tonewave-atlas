import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

/** Playwright owns the location, including project, retry and configured output directory. */
export async function screenshot(page: Page, info: TestInfo, name: string): Promise<void> {
	const path = info.outputPath(`${name}.png`);
	await mkdir(dirname(path), { recursive: true });
	await page.screenshot({ scale: 'css', path });
	await info.attach(name, { path, contentType: 'image/png' });
}
