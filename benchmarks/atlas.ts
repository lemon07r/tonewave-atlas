/** Real dataset service timing, including disk-backed fetch and first decode/index construction. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AtlasService } from '../src/core/atlas/service.ts';

const data = resolve('static/data');
const service = new AtlasService({
	baseUrl: 'https://dataset.example/',
	fetch: async (input) =>
		new Response(
			Uint8Array.from(
				await readFile(resolve(data, new URL(input instanceof Request ? input.url : input).pathname.slice(1)))
			)
		)
});

// Select a default reference without prewarming the service's manifest/catalog caches.
const { decompressGzip } = await import('../src/core/dataset/codec.ts');
const manifest = JSON.parse(await readFile(resolve(data, 'manifest.json'), 'utf8')) as { version: string };
const catalog = JSON.parse(
	new TextDecoder().decode(
		await decompressGzip(await readFile(resolve(data, manifest.version, 'catalog-iem.json.gz')))
	)
) as import('../src/core/dataset/types.ts').Catalog;
const references = [
	...new Set(
		catalog.measurements
			.filter((m) => m.partition === 'iem-711' && m.variant.kind === 'default')
			.map((m) => m.productId)
	)
].slice(0, 3);
const productId = references[0];
if (!productId) throw new Error('No iem-711 default reference; run pnpm data:pull first.');
const request = { productId, partition: 'iem-711', topK: 20 };
let start = performance.now();
const cold = await service.similar(request);
console.log(`First similar (catalog + rank decode + index): ${(performance.now() - start).toFixed(2)} ms`);
start = performance.now();
await service.similar(request);
console.log(`Resident similar: ${(performance.now() - start).toFixed(2)} ms`);
const taste = {
	partition: 'iem-711',
	items: references.map((productId) => ({
		productId,
		rating: 'like' as const,
		strength: 1,
		soundRelated: true
	})),
	topK: 20
};
start = performance.now();
const ranked = await service.taste(taste);
console.log(`Taste (3 likes, includes model construction): ${(performance.now() - start).toFixed(2)} ms`);
console.log(
	`Dataset ${manifest.version}; products ${catalog.products.length}; iem-711 measurements ${catalog.partitions.find((p) => p.id === 'iem-711')?.measurementCount ?? 0}; winners ${cold.ok ? cold.results.length : 0}/${ranked.ok ? ranked.results.length : 0}`
);
if (!cold.ok || !ranked.ok) throw new Error('Benchmark request failed');
