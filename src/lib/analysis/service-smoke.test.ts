import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { AtlasService } from '#core/atlas/service.ts';

const data = resolve('static/data');
it.skipIf(!existsSync(resolve(data, 'manifest.json')))(
	'serves the real published dataset without mixing partitions',
	async () => {
		const service = new AtlasService({
			baseUrl: 'https://dataset.example/',
			fetch: async (input) => {
				const path = new URL(input instanceof Request ? input.url : input).pathname.slice(1);
				return new Response(Uint8Array.from(await readFile(resolve(data, path))));
			}
		});
		const summary = await service.summary();
		const products = await service.products('iem');
		expect(summary.version).toBeTruthy();
		expect(summary.sources.length).toBeGreaterThan(0);
		const product = products.find((p) => p.partitions.includes('iem-711'));
		if (!product) throw new Error('Real dataset has no iem-711 products');
		const result = await service.similar({ productId: product.id, partition: 'iem-711', topK: 5 });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.results.length).toBeGreaterThan(0);
		expect(
			result.results.every(
				(r) =>
					Number.isFinite(r.distance) &&
					r.candidate.product.id !== product.id &&
					r.candidate.sources.every((s) => s.partition === 'iem-711')
			)
		).toBe(true);
		const detail = await service.productDetail(product.id);
		expect(
			detail.ok && detail.measurements.every((m) => m.curves.every((c) => c.values.length === 240))
		).toBe(true);
	}
);
