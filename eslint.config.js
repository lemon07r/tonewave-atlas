import js from '@eslint/js';
import { loadConfig } from '@sveltejs/load-config';
import prettier from 'eslint-config-prettier/flat';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const loaded = await loadConfig('./', { traverse: false });
const svelteConfig = loaded && 'config' in loaded ? loaded.config : undefined;

export default defineConfig(
	{
		ignores: [
			'.svelte-kit/**',
			'build/**',
			'coverage/**',
			'static/data/**',
			'test-results/**',
			'playwright-report/**'
		]
	},
	js.configs.recommended,
	ts.configs.strictTypeChecked,
	svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: { projectService: true, extraFileExtensions: ['.svelte'] }
		},
		rules: {
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
			'@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser, svelteConfig }
		}
	},
	{
		// The analysis engine stays framework- and DOM-free so it runs in workers, Node tools and tests alike.
		files: ['src/core/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: ['svelte', 'svelte/*', '@sveltejs/*', '$app/*', '#lib', '#lib/*', 'uplot', 'node:*'] }
			]
		}
	},
	{
		files: ['*.js', '*.ts'],
		...ts.configs.disableTypeChecked
	},
	svelte.configs.prettier,
	prettier
);
