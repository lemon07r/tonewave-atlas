/** Real-catalog cold/warm interactive timings. Disk fetch included; worker/network startup excluded. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus } from 'node:os';
import { AtlasService } from '../src/core/atlas/service.ts';
import { decompressGzip } from '../src/core/dataset/codec.ts';
import type { Catalog } from '../src/core/dataset/types.ts';
import { requireAtlasReferences, requireAtlasWinners } from './atlas-guards.ts';

if (process.argv.includes('--audit-consensus')) {
	await import('./consensus-audit.ts');
} else if (process.argv.includes('--audit-taste')) {
	await import('./taste-sanity.ts');
} else {
	const root = resolve('static/data');
	const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8')) as { version: string };
	const catalog = JSON.parse(
		new TextDecoder().decode(
			await decompressGzip(await readFile(resolve(root, manifest.version, 'catalog-iem.json.gz')))
		)
	) as Catalog;
	const ids = [
		...new Set(
			catalog.measurements
				.filter((m) => m.partition === 'iem-711' && m.variant.kind === 'default')
				.map((m) => m.productId)
		)
	].slice(0, 4);
	if (ids.length !== 4) throw new Error('Need four real default references');
	const productId = requireAtlasReferences(ids.slice(0, 3));
	function service(): AtlasService {
		return new AtlasService({
			baseUrl: 'https://dataset.example/',
			fetch: async (input) =>
				new Response(
					Uint8Array.from(
						await readFile(
							resolve(root, new URL(input instanceof Request ? input.url : input).pathname.slice(1))
						)
					)
				)
		});
	}
	const jobs: {
		name: string;
		run: (s: AtlasService) => Promise<{ ok: false } | { ok: true; results: readonly unknown[] }>;
	}[] = [
		{ name: 'similar', run: (s) => s.similar({ productId, partition: 'iem-711' }) },
		{
			name: 'taste (3 likes)',
			run: (s) =>
				s.taste({
					partition: 'iem-711',
					items: ids
						.slice(0, 3)
						.map((productId) => ({ productId, rating: 'like', strength: 1, soundRelated: true }))
				})
		},
		...[2, 3, 4].map((n) => ({
			name: `compare (${n} refs)`,
			run: (s: AtlasService) =>
				s.compare({ partition: 'iem-711', references: ids.slice(0, n).map((productId) => ({ productId })) })
		}))
	];
	console.log(
		`Dataset ${manifest.version}; ${catalog.products.length} IEM-catalog products; Node ${process.version}; ${cpus()[0]?.model}`
	);
	for (const job of jobs) {
		const s = service();
		let start = performance.now();
		const result = await job.run(s);
		const cold = performance.now() - start;
		requireAtlasWinners(result, `${job.name} cold`);
		const times: number[] = [];
		for (let i = 0; i < 5; i++) {
			start = performance.now();
			const warm = await job.run(s);
			times.push(performance.now() - start);
			requireAtlasWinners(warm, `${job.name} warm`);
		}
		times.sort((a, b) => a - b);
		const median = times[2] ?? NaN,
			maximum = times[4] ?? NaN;
		console.log(
			`${job.name}: cold ${cold.toFixed(2)} ms; warm median ${median.toFixed(2)} ms; warm max ${maximum.toFixed(2)} ms; 4x estimate ${(4 * median).toFixed(2)} ms; winners ${result.ok ? result.results.length : 0}`
		);
	}
}
