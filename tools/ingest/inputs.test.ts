import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
	readInputs,
	validateAliases,
	validateExclusions,
	validateSources,
	validateProducts
} from './common.ts';

describe('hand-maintained input validation', () => {
	it('restores the published redirect baseline unconditionally before refresh builds', async () => {
		const workflow = await readFile(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
		const restore = workflow.split(/\n {6}- /).find((step) => step.includes('run: pnpm data:pull'));
		expect(restore).toBeDefined();
		expect(restore).not.toMatch(/^\s*if:/m);
		expect(workflow.indexOf('run: pnpm data:pull')).toBeLessThan(workflow.indexOf('pnpm data:crawl'));
	});
	it('accepts the checked-in inputs and optional notes', async () => {
		const inputs = await readInputs();
		expect(inputs.excluded.sources).toContain('crinacle');
		expect(inputs.brands.CrinEars).toBe('CrinEar');
		expect(
			validateProducts({ aliases: { _note: 'Verified against the catalog', 'Brand|Old': 'Brand|New' } })
		).toEqual({ 'brand|old': 'Brand|New' });
		expect(
			validateSources({
				_note: 'sources',
				overrides: {
					_note: 'notes',
					reviewer: {
						_note: 'rig',
						form: 'iem',
						partition: 'iem-711',
						rig: '711',
						rationale: 'Curated hardware record',
						permission: 'permission granted'
					}
				}
			})
		).toEqual({
			reviewer: {
				form: 'iem',
				partition: 'iem-711',
				rig: '711',
				rationale: 'Curated hardware record',
				permission: 'permission granted'
			}
		});
	});
	it.each([
		{ aliases: {}, brands: [] },
		{ aliases: {}, brands: null },
		{ aliases: {}, brands: { _note: 42 } },
		{ aliases: {}, brands: { Maker: 42 } },
		{ aliases: {}, brands: { Maker: '!!!' } },
		{ aliases: {}, brands: { '!!!': 'Maker' } },
		{ aliases: {}, brands: { 'Maker|Old': 'Maker' } },
		{ aliases: {}, brands: { Maker: 'Maker|New' } },
		{ aliases: {}, brands: { Maker: 'MAKER' } },
		{ aliases: {}, brands: { Maker: 'Other', 'MAKE R': 'Third' } },
		{ aliases: {}, brands: { Maker: 'Other', Other: 'Third' } },
		{ aliases: {}, brands: { Maker: 'Other', Other: 'Maker' } },
		{ aliases: { 'Maker|A': 'Other|B', 'Other|B': 'Maker|C' }, brands: { Other: 'Maker' } },
		{ aliases: { 'Maker|A': 'Maker|B', 'Other|A': 'Maker|C' }, brands: { Other: 'Maker' } },
		{},
		{ aliases: [] },
		{ aliases: {}, extra: true },
		{ aliases: { 'Brand|Model': 1 } },
		{ aliases: { _note: 42 } },
		{ aliases: { Brand: 'Brand|Model' } },
		{ aliases: { 'Brand|': 'Brand|Model' } },
		{ aliases: { 'Brand|Model': 'Brand|Model|extra' } },
		{ aliases: { 'Brand|A': 'Brand|B', 'Brand|B': 'Brand|A' } },
		{ aliases: { 'Brand|A': 'Brand|B', 'brand|a': 'Brand|C' } }
	])('rejects malformed or ambiguous product aliases: %j', (value) => {
		expect(() => validateProducts(value)).toThrow('Invalid');
	});
	it('validates additional brands against the existing table before normalizing product aliases', () => {
		expect(
			validateProducts({
				brands: { _note: 'maker evidence', Old: 'Maker' },
				aliases: { 'Old|Previous': 'Maker|Current' }
			})
		).toEqual({ 'maker|previous': 'Maker|Current' });
		expect(() => validateProducts({ aliases: {}, brands: { Maker: 'New' } }, { Old: 'Maker' })).toThrow(
			'chain'
		);
		expect(() => validateProducts({ aliases: {}, brands: { Old: 'New' } }, { Old: 'Maker' })).toThrow(
			'duplicate'
		);
	});
	it.each([
		{ files: [], products: [] },
		{ source: ['reviewer'], files: [], products: [] },
		{ sources: [], files: [], products: [], extra: [] },
		{ sources: 'reviewer', files: [], products: [] },
		{ sources: ['reviewer', 1], files: [], products: [] },
		{ sources: [], files: null, products: [] },
		{ sources: [], files: [], products: [false] },
		{ sources: [], files: [], products: [], _note: false }
	])('fails closed for malformed exclusions: %j', (value) => {
		expect(() => validateExclusions(value)).toThrow('Invalid');
	});
	it.each([
		{},
		{ brand: {} },
		{ brands: {}, extra: '' },
		{ brands: [] },
		{ brands: { Reviewer: 1 } },
		{ brands: {}, _note: [] }
	])('rejects malformed aliases: %j', (value) => {
		expect(() => validateAliases(value)).toThrow('Invalid');
	});
	it.each([
		{},
		{ override: {} },
		{ overrides: {}, extra: '' },
		{ overrides: [] },
		{ overrides: { reviewer: { rigs: '711' } } },
		{ overrides: { reviewer: { form: 'earbud' } } },
		{ overrides: { reviewer: { rig: 711 } } },
		{ overrides: { reviewer: { rig: '711' } } },
		{ overrides: { reviewer: { partition: 'iem-711', rationale: '  ' } } },
		{ overrides: { reviewer: { partition: '../outside' } } },
		{ overrides: { reviewer: { permission: 'assumed' } } },
		{ overrides: { reviewer: null } }
	])('rejects malformed source overrides: %j', (value) => {
		expect(() => validateSources(value)).toThrow('Invalid');
	});
});
