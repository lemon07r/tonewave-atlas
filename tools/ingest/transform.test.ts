import { describe, expect, it } from 'vitest';
import {
	configChannels,
	configString,
	calibrationUrl,
	dataDirectory,
	discover,
	fileChannels,
	measurementUrl,
	parseOptOuts,
	phoneBook,
	validateProducts,
	supportedChannels,
	unwanted
} from './common.ts';
import { identity, normalise, sourceFor, suspiciousNames, usdPrice, variant } from './transform.ts';
import { compressPack, computePartitionStatistics } from './build.ts';
import { decodePack, decompressGzip } from '#core/dataset/codec.ts';

const db = {
	id: 'source-123',
	username: 'reviewer',
	name: 'Reviewer',
	url: 'https://reviewer.squig.link/',
	dbType: 'IEMs'
};

describe('source transforms', () => {
	it('reads only literals, respects channel config and numbered repetitions', () => {
		const config = `const DIR = 'curves/', default_channels = ['R'], num_samples = 3, rig_description = "clone IEC 711";`;
		expect(configString(config, 'rig_description')).toBe('clone IEC 711');
		expect(dataDirectory(db, config)).toBe('https://reviewer.squig.link/curves/');
		expect(configChannels(config)).toEqual(['R']);
		expect(fileChannels(config)).toEqual(['R1', 'R2', 'R3']);
		expect(measurementUrl(dataDirectory(db, ''), 'A / #?', 'L')).toBe(
			'https://reviewer.squig.link/data/A%20%2F%20%23%3F%20L.txt'
		);
		expect(parseOptOuts("let optedOut = ['a', 'crinacle']; malicious();")).toEqual(['a', 'crinacle']);
		expect(() => parseOptOuts('something changed')).toThrow();
	});
	it('ignores commented sample/channel settings without stripping URLs', () => {
		const config = `// num_samples = 5;\n/* default_channels = ['R']; */\nconst default_channels = ['L', 'R'], DIR = 'https://reviewer.squig.link/data/';`;
		expect(fileChannels(config)).toEqual(['L', 'R']);
		expect(dataDirectory(db, config)).toBe('https://reviewer.squig.link/data/');
		expect(
			parseOptOuts(`// let optedOut = [];\n/* const optedOut = ['stale']; */\nlet optedOut = ['live'];`)
		).toEqual(['live']);
	});
	it.each(['[]', '["A"]', '["L", "R", "C"]'])('rejects unsupported physical channels %s', (list) => {
		expect(() => supportedChannels(`default_channels = ${list}`)).toThrow('Unsupported channels');
	});
	it.each(['["L"]', '["R"]', '["L", "R"]', '[""]'])('accepts supported physical channels %s', (list) => {
		expect(supportedChannels(`default_channels = ${list}`)).toEqual(JSON.parse(list));
	});
	it.each([
		'http://127.0.0.1/data/',
		'https://other.squig.link/data/',
		'//other.squig.link/data/',
		'file:///etc/',
		'data:text/plain,raw',
		'javascript:alert(1)',
		'http://reviewer.squig.link/data/',
		'https://reviewer.squig.link:444/data/',
		'https://user:pass@reviewer.squig.link/data/'
	])('rejects a remote config redirect to %s', (path) => {
		expect(() => dataDirectory(db, `const DIR = '${path}';`)).toThrow('same-origin');
		expect(() => calibrationUrl(dataDirectory(db, ''), path)).toThrow('same-origin');
	});
	it('resolves relative, root-relative and same-origin absolute calibration paths', () => {
		const dir = dataDirectory(db, "DIR = '/measurements'");
		expect(dir).toBe('https://reviewer.squig.link/measurements/');
		expect(calibrationUrl(dir, 'IEF Cal')).toBe('https://reviewer.squig.link/measurements/IEF%20Cal.txt');
		expect(calibrationUrl(dir, '/data/cal.txt')).toBe('https://reviewer.squig.link/data/cal.txt');
		expect(calibrationUrl(dir, 'https://reviewer.squig.link/cal/')).toBe(
			'https://reviewer.squig.link/cal/calibration.txt'
		);
		expect(calibrationUrl(dir, 'folder/Offset #1?.txt')).toBe(
			'https://reviewer.squig.link/measurements/folder/Offset%20%231%3F.txt'
		);
	});
	it('discovers root/subdomain/lab URLs but never altDomain/crinacle', () => {
		const entries = ['root', 'subdomain', 'labFolder', 'altDomain'].map((urlType) => ({
			username: 'reviewer',
			name: 'Reviewer',
			urlType,
			dbs: [{ folder: '/headphones/', type: 'Headphones' }]
		}));
		expect(discover(entries).map((d) => d.url)).toEqual([
			'https://squig.link/headphones/',
			'https://reviewer.squig.link/headphones/',
			'https://squig.link/lab/reviewer/headphones/'
		]);
	});
	it('preserves suffix/default semantics and warns on unsupported schemas', () => {
		const book = phoneBook([
			{
				name: 'Brand',
				phones: [
					{ name: 'Model', file: ['a', 'b tips', 'c DSP'], suffix: ['', '(foam tips)', '(DSP)'] },
					{ name: 'Other', variants: [] }
				]
			}
		]);
		const phone = book.phones[0];
		if (!phone) throw new Error('missing fixture');
		expect(variant(phone, 0, 'm-123')).toMatchObject({ kind: 'default', isDefault: true, label: '' });
		expect(variant(phone, 1, 'm-456')).toMatchObject({ kind: 'fit', label: '(foam tips)' });
		expect(variant(phone, 2, 'm-789').kind).toBe('tuning');
		expect(book.warnings).toHaveLength(1);
	});
	it('normalises spelling only, and reports rather than merges near names', () => {
		expect(normalise('SÓFT Ears')).toBe('softears');
		expect(identity('CRINEARS', 'Reference', 'iem', { crinears: 'CrinEar' }).id).toBe(
			identity('CrinEar', 'reference', 'iem', {}).id
		);
		expect(identity('CrinEar', 'Ref', 'iem', {}).id).not.toBe(identity('CrinEar', 'Reference', 'iem', {}).id);
		expect(
			suspiciousNames([
				{ id: 'a', brand: 'Brand', model: 'Reference' },
				{ id: 'b', brand: 'Brand', model: 'Referenc' }
			])
		).toEqual([{ left: 'b', right: 'a' }]);
	});
	it.each([
		['Moondrop', 'moondrop Moondrop Kato', 'Kato'],
		['Moondrop', ' MOON DROP   Kato ', 'Kato'],
		['64 Audio', '64Audio U12t', 'U12t'],
		['Moondrop', 'Moondrop', 'Moondrop'],
		['KZ', 'KZfoo', 'KZfoo']
	])('strips only a complete repeated leading brand: %s / %s', (brand, model, expected) => {
		expect(identity(brand, model, 'iem', {}).model).toBe(expected);
	});
	it('applies explicit product aliases without merging variants or crossing forms', () => {
		const aliases = validateProducts({ aliases: { 'MOONDROP|Aria II': 'MOONDROP|Aria 2' } });
		const a = identity('MOONDROP', 'Aria II', 'iem', {}, aliases);
		expect(a.id).toBe(identity('MOONDROP', 'Aria 2', 'iem', {}, aliases).id);
		expect(a.id).not.toBe(identity('MOONDROP', 'Aria II DSP', 'iem', {}, aliases).id);
		expect(a.id).not.toBe(identity('MOONDROP', 'Aria II', 'headphone', {}, aliases).id);
	});
	it.each([
		['Balanced cable', 'setup'],
		['sample 2', 'unit'],
		['ANC', 'tuning'],
		['amp', 'setup']
	])('classifies %s without substring collisions', (label, kind) => {
		const phone = {
			brand: 'Brand',
			name: 'Model',
			file: ['stock', label],
			suffix: [],
			price: null,
			reviewLink: null
		};
		expect(variant(phone, 1, 'm-test').kind).toBe(kind);
	});
	it('rejects mixed file arrays with an audit warning instead of truncating them', () => {
		const result = phoneBook([{ name: 'Brand', phones: [{ name: 'Model', file: ['a', 42, 'b'] }] }]);
		expect(result.phones).toEqual([]);
		expect(result.warnings).toEqual(['Unsupported/missing file list: Brand Model']);
	});
	it('reports and removes exact duplicate index rows rather than duplicating measurement IDs', () => {
		const phone = { name: 'ZS10 PRO', file: 'KZ ZS10 PRO' };
		const result = phoneBook([{ name: 'KZ', phones: [phone, phone] }]);
		expect(result.phones).toHaveLength(1);
		expect(result.warnings).toEqual(['Duplicate phone entry: KZ ZS10 PRO']);
	});
	it.each([
		['$1,200.50', 1200.5],
		['USD 50', 50],
		['US$ 30', 30],
		['19.99 USD', 19.99],
		['50', null],
		['€100', null],
		['$50 CAD', null],
		['$20–30', null],
		['$???', null]
	])('parses only explicit USD forms: %s', (raw, expected) => {
		expect(usdPrice(raw)).toBe(expected);
	});
	it('never mixes IEM and headphone 5128, and isolates unknown headphone rigs', () => {
		expect(sourceFor(db, '', 'date', {}).partition).toBe('iem-711');
		expect(sourceFor({ ...db, dbType: '5128' }, '', 'date', {}).partition).toBe('iem-5128');
		expect(
			sourceFor({ ...db, dbType: '5128', url: 'https://reviewer.squig.link/headphones/' }, '', 'date', {})
				.partition
		).toBe('headphone-5128');
		expect(sourceFor({ ...db, dbType: 'Headphones' }, '', 'date', {}).partition).toBe(
			'headphone-source-source-123'
		);
		expect(() => sourceFor(db, '', 'date', { partition: '../bad' })).toThrow('Unsafe');
	});
	it('rejects target/sandbox/delta entries by name and leaves statistics explicitly absent', () => {
		expect(['Harman Target', 'EQ sandbox', '∆ Reference', 'IEF Calibration'].every(unwanted)).toBe(true);
		expect(unwanted('CrinEar Reference')).toBe(false);
		expect(unwanted('Brainwavz Delta')).toBe(false);
		expect(computePartitionStatistics([])).toMatchObject({
			support: { status: 'low', multiSourceProducts: 0 },
			harmonisation: { pairs: 0, meanImprovement: null }
		});
	});
	it.each([
		['unknown coupler', true],
		['IEC 60318-4', false],
		['IEC 60711', false],
		['clone 711', false]
	])('qualifies the default 711 partition for %s', (rig, rigInferred) => {
		expect(sourceFor(db, `rig_description = "${rig}";`, 'date', {})).toMatchObject({
			partition: 'iem-711',
			rigInferred
		});
	});
	it('chooses the measured smaller gzip layout and decodes it', async () => {
		const result = compressPack({
			kind: 'detail',
			partition: 'iem-711',
			points: 240,
			curves: Array.from({ length: 20 }, (_, i) => ({
				measurementId: `m-${i}`,
				channel: 'L',
				values: Float64Array.from({ length: 240 }, (_, f) => 70 + Math.sin(f / 20) + i / 10)
			})),
			statistics: null
		});
		expect(result.bytes.length).toBe(Math.min(result.curveMajorBytes, result.frequencyMajorBytes));
		expect(decodePack(await decompressGzip(result.bytes)).curves).toHaveLength(20);
	});
});
