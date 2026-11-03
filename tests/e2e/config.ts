import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.ts';

export default defineConfig({
	...base,
	testDir: '.',
	workers: 2,
	use: { ...base.use, baseURL: 'http://localhost:4190' },
	projects: [
		{ name: 'desktop', use: { ...base.projects?.[0]?.use, viewport: { width: 1440, height: 900 } } },
		{ name: 'tablet', use: { ...base.projects?.[0]?.use, viewport: { width: 834, height: 1112 } } },
		{ name: 'mobile', use: { ...base.projects?.[1]?.use, viewport: { width: 390, height: 844 } } }
	],
	webServer: {
		command: 'pnpm preview --port 4190 --strictPort',
		port: 4190,
		reuseExistingServer: !process.env.CI
	}
});
