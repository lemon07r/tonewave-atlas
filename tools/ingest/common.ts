import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Form, Source } from '#core/dataset/types.ts';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CACHE = resolve(ROOT, '.cache/ingest');
export const OUTPUT = resolve(ROOT, 'static/data');
export const USER_AGENT = 'TonewaveAtlas-ingest/1 (+https://github.com/lemon07r/tonewave-atlas)';
export const DIRECTORY_URL = 'https://squig.link/squigsites.json';
export const OPT_OUT_URL = 'https://squig.link/squigsites.js';

export function sha256(value: string | Uint8Array): string {
	return createHash('sha256').update(value).digest('hex');
}

export async function atomicWrite(path: string, value: string | Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${randomUUID()}.partial`;
	await writeFile(temp, value);
	await rename(temp, path);
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
		: Array.isArray(value)
			? value.filter((s): s is string => typeof s === 'string')
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

export interface SourceOverride {
	form?: Form;
	partition?: string;
	rig?: string;
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
		const o = keys(override, ['form', 'partition', 'rig', 'permission'], [], `sources.overrides.${name}`);
		const parsed: SourceOverride = {};
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
	overrides: Record<string, SourceOverride>;
}> {
	const [excluded, brands, overrides] = await Promise.all(
		['exclusions', 'aliases', 'sources'].map((name) => readJson(resolve(root, `data/${name}.json`)))
	);
	return {
		excluded: validateExclusions(excluded),
		brands: validateAliases(brands),
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

/** Numbered files represent repeated samples; preserve their identities in detail packs. */
export function fileChannels(config: string): string[] {
	const channels = configChannels(config);
	const raw = /\bnum_samples\s*=\s*(\d+)/.exec(withoutComments(config))?.[1];
	if (raw === undefined) return channels;
	const n = Number(raw);
	if (n < 1 || n > 100) throw new Error('Unsupported num_samples');
	return channels.flatMap((channel) => Array.from({ length: n }, (_, i) => `${channel}${i + 1}`));
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
	const url = sameOriginUrl(stem, dir);
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
		// altDomain/crinacle is excluded before constructing URLs.
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

export function parseOptOuts(script: string): string[] {
	const content = /\b(?:let|const|var)\s+optedOut\s*=\s*\[([^\]]*)\]/.exec(script)?.[1];
	if (content === undefined) throw new Error('Could not read upstream opt-outs; refusing to crawl/build');
	return [...content.matchAll(/["']([^"']+)["']/g)].map((m) => m[1] ?? '');
}

export function formFor(db: Database): Form {
	return db.dbType === 'Headphones' || /headphone|headset/i.test(new URL(db.url).pathname)
		? 'headphone'
		: 'iem';
}

export function unwanted(name: string): boolean {
	return /target|eq[\s_-]*sandbox|[∆Δ]|\b(?:compensation|calibration)\b/i.test(name);
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
