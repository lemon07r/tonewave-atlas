import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatasetFile, Form, Source } from '#core/dataset/types.ts';
import { classifyEq } from './eq.ts';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CACHE = resolve(ROOT, '.cache/ingest');
export const OUTPUT = resolve(ROOT, 'static/data');
export const USER_AGENT = 'TonewaveAtlas-ingest/1 (+https://github.com/lemon07r/tonewave-atlas)';
export const DIRECTORY_URL = 'https://squig.link/squigsites.json';

export function sha256(value: string | Uint8Array): string {
	return createHash('sha256').update(value).digest('hex');
}

/** Same canonical field order as the v1 builder; paths here are version-relative filenames. */
export function datasetVersion(files: DatasetFile[], sources: Source[]): string {
	return sha256(
		JSON.stringify({
			formatVersion: 1,
			files: files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
			sources: sources.map(
				({
					id,
					username,
					name,
					url,
					dbType,
					form,
					partition,
					rig,
					rigInferred,
					permission,
					crawledAt,
					calibration,
					rigEvidence,
					forms,
					partitions
				}) => ({
					id,
					username,
					name,
					url,
					dbType,
					form,
					partition,
					rig,
					rigInferred,
					permission,
					crawledAt,
					calibration,
					...(rigEvidence === undefined ? {} : { rigEvidence }),
					...(forms === undefined ? {} : { forms }),
					...(partitions === undefined ? {} : { partitions })
				})
			)
		})
	).slice(0, 24);
}

export async function atomicWrite(path: string, value: string | Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${randomUUID()}.partial`;
	try {
		await writeFile(temp, value);
		await rename(temp, path);
	} catch (error) {
		try {
			await rm(temp, { force: true });
		} catch (cleanup) {
			console.warn(`Could not remove ${temp}: ${errorMessage(cleanup)}`);
		}
		throw error;
	}
}

export async function readJson(path: string): Promise<unknown> {
	return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) as unknown;
}

export function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function strings(value: unknown): string[] {
	return typeof value === 'string'
		? [value]
		: Array.isArray(value) && value.every((s: unknown) => typeof s === 'string')
			? value
			: [];
}

export interface Database {
	id: string;
	username: string;
	name: string;
	url: string;
	dbType: string;
}

export interface CrawlSnapshot {
	startedAt: string;
	finishedAt: string | null;
	limited: boolean;
	sources: Database[];
	excluded: { id: string; reason: string }[];
	errors: { id: string; error: string }[];
	retainedFailures?: { id: string; url: string; status: number | null; at: string; error: string }[];
}

export interface Exclusions {
	sources: string[];
	files: string[];
	products: string[];
}

function keys(value: unknown, allowed: string[], required: string[], label: string): Record<string, unknown> {
	if (
		!record(value) ||
		required.some((key) => !Object.hasOwn(value, key)) ||
		Object.keys(value).some((key) => key !== '_note' && !allowed.includes(key)) ||
		(value._note !== undefined && typeof value._note !== 'string')
	)
		throw new Error(`Invalid ${label}: missing/unknown keys or invalid _note`);
	return value;
}

function stringArray(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === 'string'))
		throw new Error(`Invalid ${label}: expected an array of strings`);
	return value;
}

export function validateExclusions(value: unknown): Exclusions {
	const v = keys(
		value,
		['sources', 'files', 'products'],
		['sources', 'files', 'products'],
		'exclusions.json'
	);
	return {
		sources: stringArray(v.sources, 'exclusions.sources'),
		files: stringArray(v.files, 'exclusions.files'),
		products: stringArray(v.products, 'exclusions.products')
	};
}

export function validateAliases(value: unknown): Record<string, string> {
	const v = keys(value, ['brands'], ['brands'], 'aliases.json');
	if (!record(v.brands)) throw new Error('Invalid aliases.brands: expected a string map');
	const brands: Record<string, string> = Object.create(null) as Record<string, string>;
	for (const [name, alias] of Object.entries(v.brands)) {
		if (typeof alias !== 'string') throw new Error(`Invalid aliases.brands.${name}: expected a string`);
		if (name !== '_note') brands[name] = alias;
	}
	return brands;
}

export function productAliasKey(brand: string, model: string): string {
	return [brand, model]
		.map((part) =>
			part
				.normalize('NFKD')
				.replace(/\p{M}/gu, '')
				.toLowerCase()
				.replace(/[^\p{L}\p{N}]/gu, '')
		)
		.join('|');
}

/** Additional maker aliases are terminal; legacy punctuation/case-only entries remain valid. */
function validateProductBrands(
	value: unknown,
	existing: Record<string, string> = {}
): Record<string, string> {
	const v = keys(value, ['aliases', 'brands'], ['aliases'], 'products.json');
	if (v.brands !== undefined && !record(v.brands))
		throw new Error('Invalid products.brands: expected a string map');
	const normalized = (brand: string) => productAliasKey(brand, '').slice(0, -1);
	const mappings: Record<string, string> = Object.create(null) as Record<string, string>;
	for (const [from, to] of Object.entries(existing)) {
		const key = normalized(from);
		if (Object.hasOwn(mappings, key) && normalized(mappings[key] ?? '') !== normalized(to))
			throw new Error(`Invalid conflicting brand alias: ${from}`);
		mappings[key] = to;
	}
	const brands: Record<string, string> = Object.create(null) as Record<string, string>;
	for (const [from, to] of Object.entries(v.brands ?? {})) {
		if (typeof to !== 'string') throw new Error(`Invalid products.brands.${from}: expected a string`);
		if (from === '_note') continue;
		const key = normalized(from);
		if (!key || !normalized(to) || from.includes('|') || to.includes('|'))
			throw new Error(`Invalid brand alias: ${from}`);
		if (Object.hasOwn(mappings, key) || key === normalized(to))
			throw new Error(`Invalid duplicate/redundant brand alias: ${from}`);
		brands[key] = to.trim().replace(/\s+/g, ' ');
		mappings[key] = brands[key];
	}
	for (const to of Object.values(mappings)) {
		const next = mappings[normalized(to)];
		if (next !== undefined && normalized(next) !== normalized(to))
			throw new Error('Invalid brand alias chain/cycle');
	}
	return brands;
}

export function validateProducts(
	value: unknown,
	existingBrands: Record<string, string> = {}
): Record<string, string> {
	const brands = validateProductBrands(value, existingBrands);
	for (const [from, to] of Object.entries(existingBrands))
		brands[productAliasKey(from, '').slice(0, -1)] = to;
	const canonicalBrand = (brand: string) => brands[productAliasKey(brand, '').slice(0, -1)] ?? brand;
	const v = keys(value, ['aliases', 'brands'], ['aliases'], 'products.json');
	if (!record(v.aliases)) throw new Error('Invalid products.aliases: expected a string map');
	const aliases: Record<string, string> = Object.create(null) as Record<string, string>;
	const pair = (value: string): string[] => {
		const parts = value.split('|');
		if (parts.length !== 2 || parts.some((p) => !p.trim() || !/[\p{L}\p{N}]/u.test(p)))
			throw new Error(`Invalid product alias pair: ${value}`);
		return parts;
	};
	for (const [from, to] of Object.entries(v.aliases)) {
		if (typeof to !== 'string') throw new Error(`Invalid product alias: ${from}`);
		if (from === '_note') continue;
		const [brand = '', model = ''] = pair(from);
		pair(to);
		const key = productAliasKey(canonicalBrand(brand), model);
		if (Object.hasOwn(aliases, key)) throw new Error(`Invalid duplicate product alias: ${from}`);
		aliases[key] = to;
	}
	for (const to of Object.values(aliases)) {
		const [brand = '', model = ''] = pair(to);
		if (Object.hasOwn(aliases, productAliasKey(canonicalBrand(brand), model)))
			throw new Error('Invalid product alias chain/cycle/redundant mapping');
	}
	return aliases;
}

export interface SourceOverride {
	form?: Form;
	partition?: string;
	rig?: string;
	rationale?: string;
	permission?: Source['permission'];
}

export function validateSources(value: unknown): Record<string, SourceOverride> {
	const v = keys(value, ['overrides'], ['overrides'], 'sources.json');
	if (!record(v.overrides)) throw new Error('Invalid sources.overrides: expected a map');
	const overrides: Record<string, SourceOverride> = Object.create(null) as Record<string, SourceOverride>;
	for (const [name, override] of Object.entries(v.overrides)) {
		if (name === '_note') {
			if (typeof override !== 'string') throw new Error('Invalid sources.overrides._note');
			continue;
		}
		const o = keys(
			override,
			['form', 'partition', 'rig', 'rationale', 'permission'],
			[],
			`sources.overrides.${name}`
		);
		const parsed: SourceOverride = {};
		if (Object.hasOwn(o, 'rationale')) {
			if (typeof o.rationale !== 'string' || !o.rationale.trim())
				throw new Error(`Invalid source rationale: ${name}`);
			parsed.rationale = o.rationale;
		}
		if ((Object.hasOwn(o, 'rig') || Object.hasOwn(o, 'partition')) && !parsed.rationale)
			throw new Error(`Invalid source rig/partition override without rationale: ${name}`);
		if (Object.hasOwn(o, 'form')) {
			if (o.form !== 'iem' && o.form !== 'headphone') throw new Error(`Invalid source form: ${name}`);
			parsed.form = o.form;
		}
		if (Object.hasOwn(o, 'partition')) {
			if (typeof o.partition !== 'string' || !/^[a-z0-9-]+$/.test(o.partition))
				throw new Error(`Invalid source partition: ${name}`);
			parsed.partition = o.partition;
		}
		if (Object.hasOwn(o, 'rig')) {
			if (typeof o.rig !== 'string') throw new Error(`Invalid source rig: ${name}`);
			parsed.rig = o.rig;
		}
		if (Object.hasOwn(o, 'permission')) {
			if (o.permission !== 'permission granted' && o.permission !== 'public, not explicitly licensed')
				throw new Error(`Invalid source permission: ${name}`);
			parsed.permission = o.permission;
		}
		overrides[name] = parsed;
	}
	return overrides;
}

/** Validate every hand-maintained input before either command does any work. */
export async function readInputs(root = ROOT): Promise<{
	excluded: Exclusions;
	brands: Record<string, string>;
	productAliases: Record<string, string>;
	overrides: Record<string, SourceOverride>;
}> {
	const [excluded, brands, overrides, products] = await Promise.all(
		['exclusions', 'aliases', 'sources', 'products'].map((name) =>
			readJson(resolve(root, `data/${name}.json`))
		)
	);
	const existingBrands = validateAliases(brands);
	return {
		excluded: validateExclusions(excluded),
		brands: { ...existingBrands, ...validateProductBrands(products, existingBrands) },
		productAliases: validateProducts(products, existingBrands),
		overrides: validateSources(overrides)
	};
}

/** Remove comments without damaging quoted URLs. Remote scripts are never evaluated. */
function withoutComments(config: string): string {
	let out = '';
	let quote = '';
	for (let i = 0; i < config.length; i++) {
		const c = config[i] ?? '';
		if (quote) {
			out += c;
			if (c === '\\') {
				out += config[++i] ?? '';
			} else if (c === quote) quote = '';
		} else if (c === '"' || c === "'" || c === '`') {
			quote = c;
			out += c;
		} else if (c === '/' && config[i + 1] === '/') {
			while (i < config.length && config[i] !== '\n') i++;
			out += '\n';
		} else if (c === '/' && config[i + 1] === '*') {
			i += 2;
			while (i < config.length && !(config[i] === '*' && config[i + 1] === '/')) {
				if (config[i] === '\n') out += '\n';
				i++;
			}
			i++;
			out += ' ';
		} else out += c;
	}
	return out;
}

/** Never execute remotely supplied JavaScript. Read only literal configuration values. */
export function configString(config: string, key: string): string | null {
	const clean = withoutComments(config);
	const match = new RegExp(`\\b${key}\\s*=\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`).exec(clean);
	return match?.[2]?.replace(/\\([\\"'])/g, '$1') ?? null;
}

export function configChannels(config: string): string[] {
	const list = /\bdefault_channels\s*=\s*\[([^\]]*)\]/.exec(withoutComments(config))?.[1];
	if (list === undefined) return ['L', 'R'];
	return [...list.matchAll(/["']([^"']*)["']/g)].map((m) => m[1] ?? '');
}

/** Supported physical channels; numbered repetitions are expanded only after this check. */
export function supportedChannels(config: string): string[] {
	const channels = configChannels(config);
	if (!channels.length || channels.length > 2 || channels.some((c) => !['L', 'R', ''].includes(c)))
		throw new Error(`Unsupported channels: ${JSON.stringify(channels)}`);
	return channels;
}

/** Numbered files represent repeated samples; preserve their identities in detail packs. */
export function fileChannels(config: string): string[] {
	const channels = configChannels(config);
	const raw = /\bnum_samples\s*=\s*(\d+)/.exec(withoutComments(config))?.[1];
	if (raw === undefined) return channels;
	const n = Number(raw);
	if (n < 1 || n > 100) throw new Error('Unsupported num_samples');
	return channels.flatMap((channel) => Array.from({ length: n }, (_, i) => `${channel}${i + 1}`));
}

/** Discover the first config script without executing any remotely supplied HTML or JavaScript. */
export function configScriptUrl(html: string, pageUrl: string): string | null {
	const scripts = html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi);
	for (const script of scripts) {
		const attributes = (script[1] ?? '').matchAll(
			/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
		);
		const source = [...attributes].find((attribute) => attribute[1]?.toLowerCase() === 'src');
		const src = source?.[2] ?? source?.[3] ?? source?.[4];
		const path = src?.split(/[?#]/, 1)[0];
		if (src && path && /(?:^|\/)config[^/]*\.js$/i.test(path)) return sameOriginUrl(src, pageUrl).href;
	}
	return null;
}

export function dataDirectory(db: Database, config: string): string {
	const dir = configString(config, 'DIR') ?? 'data/';
	const url = sameOriginUrl(dir, db.url);
	if (!url.pathname.endsWith('/')) url.pathname += '/';
	return url.href;
}

function sameOriginUrl(value: string, base: string): URL {
	const source = new URL(base);
	const url = new URL(value, source);
	if (
		!['http:', 'https:'].includes(source.protocol) ||
		!['http:', 'https:'].includes(url.protocol) ||
		url.origin !== source.origin ||
		url.username ||
		url.password
	)
		throw new Error(`Rejected remote config path (same-origin HTTP(S) required): ${value}`);
	return url;
}

export function measurementUrl(dir: string, file: string, channel: string): string {
	return new URL(encodeURIComponent(`${file}${channel ? ` ${channel}` : ''}.txt`), dir).href;
}

export function calibrationUrl(dir: string, stem: string): string {
	// Relative values are filenames/paths, not query strings or fragments. Leave actual URLs to
	// sameOriginUrl so protocol-relative and non-HTTP(S) values cannot evade origin validation.
	const path = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(stem)
		? stem
		: stem
				.split('/')
				.map((part) => encodeURIComponent(part))
				.join('/');
	const url = sameOriginUrl(path, dir);
	if (!/\.txt$/i.test(url.pathname)) url.pathname += url.pathname.endsWith('/') ? 'calibration.txt' : '.txt';
	return url.href;
}

export interface Phone {
	brand: string;
	name: string;
	file: string[];
	suffix: string[];
	price: string | null;
	reviewLink: string | null;
}

/** Malformed books fail visibly. Unsupported new schemas are reported, never silently invented. */
export function phoneBook(value: unknown): { phones: Phone[]; warnings: string[] } {
	if (!Array.isArray(value)) throw new Error('Phone book must be an array');
	const phones: Phone[] = [];
	const warnings: string[] = [];
	const seen = new Set<string>();
	for (const brand of value as unknown[]) {
		if (!record(brand) || typeof brand.name !== 'string' || !Array.isArray(brand.phones)) {
			warnings.push('Invalid brand entry');
			continue;
		}
		for (const phone of brand.phones as unknown[]) {
			if (!record(phone) || typeof phone.name !== 'string') {
				warnings.push(`Invalid phone entry in ${brand.name}`);
				continue;
			}
			const file = strings(phone.file);
			if (!file.length) {
				warnings.push(`Unsupported/missing file list: ${brand.name} ${phone.name}`);
				continue;
			}
			const parsed: Phone = {
				brand: brand.name,
				name: phone.name,
				file,
				suffix: strings(phone.suffix),
				price: string(phone.price),
				reviewLink: string(phone.reviewLink)
			};
			const key = JSON.stringify(parsed);
			if (seen.has(key)) {
				warnings.push(`Duplicate phone entry: ${brand.name} ${phone.name}`);
				continue;
			}
			seen.add(key);
			phones.push(parsed);
		}
	}
	return { phones, warnings };
}

export function discover(value: unknown): Database[] {
	if (!Array.isArray(value)) throw new Error('Invalid source directory');
	const databases: Database[] = [];
	for (const site of value as unknown[]) {
		if (
			!record(site) ||
			typeof site.username !== 'string' ||
			typeof site.name !== 'string' ||
			!Array.isArray(site.dbs)
		)
			throw new Error('Invalid directory entry');
		// hangout.audio (crinacle, the only altDomain) serves encrypted files behind an access check; skip it.
		if (site.urlType === 'altDomain' || site.username === 'crinacle') continue;
		const origin =
			site.urlType === 'root'
				? 'https://squig.link'
				: site.urlType === 'subdomain'
					? `https://${site.username}.squig.link`
					: site.urlType === 'labFolder'
						? `https://squig.link/lab/${site.username}`
						: null;
		if (!origin) throw new Error(`Unknown urlType for ${site.username}`);
		for (const db of site.dbs as unknown[]) {
			if (!record(db) || typeof db.folder !== 'string' || typeof db.type !== 'string')
				throw new Error('Invalid database entry');
			const url = `${origin}${db.folder}`.replace(/\/?$/, '/');
			databases.push({
				id: `${site.username}-${db.type.toLowerCase()}-${sha256(url).slice(0, 8)}`,
				username: site.username,
				name: site.name,
				url,
				dbType: db.type
			});
		}
	}
	return databases;
}

export function formFor(db: Database): Form {
	return db.dbType === 'Headphones' || /headphone|headset/i.test(new URL(db.url).pathname)
		? 'headphone'
		: 'iem';
}

export function unwanted(name: string): boolean {
	return nonProductName(name) !== null;
}

export function nonProductName(name: string): string | null {
	if (/\b(?:fake|replica|counterfeit)\b/i.test(name))
		return 'explicit fake/replica/counterfeit product or file';
	if (/target|eq[\s_-]*sandbox|[∆Δ]|\b(?:compensation|calibration)\b/i.test(name))
		return 'target/calibration/delta/sandbox curve';
	return derivedName(name);
}

/** Exclude explicit post-hoc operations, never factory or uncertain preset labels. */
export function derivedName(name: string): string | null {
	if (/\baverage\s+(?:iem|headphone)s?\b/i.test(name)) return 'derived population average';
	return classifyEq(name) === 'post-hoc' ? 'derived EQ curve' : null;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
