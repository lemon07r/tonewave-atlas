import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Form } from '#core/dataset/types.ts';

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

export async function exclusions(): Promise<Exclusions> {
	const value = await readJson(resolve(ROOT, 'data/exclusions.json'));
	if (!record(value)) throw new Error('Invalid exclusions');
	return { sources: strings(value.sources), files: strings(value.files), products: strings(value.products) };
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
	return new URL(dir.endsWith('/') ? dir : `${dir}/`, db.url).href;
}

export function measurementUrl(dir: string, file: string, channel: string): string {
	return new URL(encodeURIComponent(`${file}${channel ? ` ${channel}` : ''}.txt`), dir).href;
}

export function calibrationUrl(dir: string, stem: string): string {
	if (/^https?:\/\//i.test(stem)) {
		const url = new URL(stem);
		if (!/\.txt$/i.test(url.pathname))
			url.pathname += url.pathname.endsWith('/') ? 'calibration.txt' : '.txt';
		return url.href;
	}
	return new URL(
		stem.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/') +
			(/\.txt$/i.test(stem) ? '' : '.txt'),
		dir
	).href;
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
