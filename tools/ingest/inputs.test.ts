import { describe, expect, it } from 'vitest';
import {
	readInputs,
	validateAliases,
	validateExclusions,
	validateSources,
	validateProducts
} from './common.ts';

describe('hand-maintained input validation', () => {
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
						permission: 'permission granted'
					}
				}
			})
		).toEqual({
			reviewer: { form: 'iem', partition: 'iem-711', rig: '711', permission: 'permission granted' }
		});
	});
	it.each([
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
		{ overrides: { reviewer: { partition: '../outside' } } },
		{ overrides: { reviewer: { permission: 'assumed' } } },
		{ overrides: { reviewer: null } }
	])('rejects malformed source overrides: %j', (value) => {
		expect(() => validateSources(value)).toThrow('Invalid');
	});
});
