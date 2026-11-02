import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.ts';

export default defineConfig({
	...base,
	testDir: '.',
	use: { ...base.use, baseURL: 'http://localhost:4190' },
	webServer: {
		command: 'pnpm preview --port 4190 --strictPort',
		port: 4190,
		reuseExistingServer: !process.env.CI
	}
});
