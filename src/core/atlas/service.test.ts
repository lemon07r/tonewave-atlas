import { describe, expect, it } from 'vitest';
import { encodePack, type CurvePack } from '../dataset/codec.ts';
import type {
	Catalog,
	Manifest,
	Measurement,
	Partition,
	Product,
	Source,
	VariantKind
} from '../dataset/types.ts';
import { GRID, RANK_GRID, RANK_SIZE } from '../grid.ts';
import { buildPartitionIndex } from './index.ts';
import { AtlasService } from './service.ts';

function fixture(cacheSize = 8) {
	const sources: Source[] = ['s1', 's2', 's3'].map((id) => ({
		id,
		username: id,
		name: id,
		url: `https://${id}.example/`,
		dbType: 'iems',
		form: 'iem',
		partition: 'iem-711',
		rig: '711',
		rigInferred: false,
		permission: 'public, not explicitly licensed',
		crawledAt: '2026-11-01',
		calibration: null
	}));
	const products: Product[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
		id,
		brand: 'Brand',
		model: id.toUpperCase(),
		form: 'iem',
		measurementIds: []
	}));
	const measurements: Measurement[] = [];
	const rankCurves: CurvePack['curves'] = [];
	const detailCurves: CurvePack['curves'] = [];
	const base = Float64Array.from(RANK_GRID, (_, i) => (i < 60 ? 0 : 2));
	function add(
		id: string,
		productId: string,
		sourceId: string,
		offset: number,
		shape: number,
		kind: VariantKind = 'default',
		price: number | null = 100,
		partition = 'iem-711'
	) {
		const measurement: Measurement = {
			id,
			productId,
			sourceId,
			partition,
			variant: {
				id: `v-${id}`,
				label: kind === 'default' ? '' : `Verbatim (${id})`,
				file: id,
				kind,
				isDefault: kind === 'default'
			},
			channels: ['L', 'R'],
			channelContributions: Array.from(GRID, () => 3),
			imbalanceDb: 2,
			pairedBins: 160,
			dated: { L: 'original date', R: null },
			lastModified: { L: null, R: null },
			price: price === null ? null : { raw: `$${price}`, usd: price, sourceId, crawledAt: '2026-11-01' },
			reviewUrl: null,
			detailFile: `detail-${partition}-${productId}.bin.gz`,
			provenance: {
				sourceId,
				databaseUrl: `https://${sourceId}.example/`,
				originalUrls: [`https://${sourceId}.example/${id}.txt`],
				processing: ['resampled'],
				calibrationUrl: null
			},
			warnings: []
		};
		measurements.push(measurement);
		products.find((p) => p.id === productId)?.measurementIds.push(id);
		const values = Float64Array.from(base, (v, i) => v + offset + (i < 60 ? -shape : shape));
		rankCurves.push({ measurementId: id, channel: 'avg', values });
		for (const channel of ['L', 'R'])
			detailCurves.push({
				measurementId: id,
				channel,
				values: Float64Array.from(
					GRID,
					(_, i) => (values[Math.floor(i / 2)] ?? 0) + (channel === 'L' ? -1 : 1)
				)
			});
	}
	add('a1', 'a', 's1', 0, 0);
	add('a2', 'a', 's2', 8, 0);
	add('a-tune', 'a', 's1', 0, 1, 'tuning');
	add('b1', 'b', 's1', 3, 0, 'default', 50);
	add('b-tune', 'b', 's1', 0, 5, 'tuning', 60);
	add('c1', 'c', 's1', 0, 2, 'default', 150);
	add('c2', 'c', 's2', 8, 4, 'default', 180);
	add('c-fit', 'c', 's3', 0, 30, 'fit', 1);
	add('d1', 'd', 's1', 0, 0, 'default', 20, 'iem-5128');
	add('e-fit', 'e', 's1', 0, 0, 'fit', null);
	const partitions: Partition[] = ['iem-711', 'iem-5128'].map((id) => ({
		id,
		form: 'iem',
		measurementCount: measurements.filter((m) => m.partition === id).length,
		rankFile: `rank-${id}.bin.gz`,
		detailFiles: [...new Set(measurements.filter((m) => m.partition === id).map((m) => m.detailFile))],
		statistics: null
	}));
	const catalog: Catalog = { formatVersion: 1, form: 'iem', products, measurements, sources, partitions };
	const empty: Catalog = {
		formatVersion: 1,
		form: 'headphone',
		products: [],
		measurements: [],
		sources: [],
		partitions: []
	};
	const files = new Map<string, Uint8Array>();
	const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
	files.set('v1/catalog-iem.json.gz', json(catalog));
	files.set('v1/catalog-headphone.json.gz', json(empty));
	const packs: CurvePack[] = [];
	for (const partition of partitions) {
		const ids = new Set(measurements.filter((m) => m.partition === partition.id).map((m) => m.id));
		const pack: CurvePack = {
			kind: 'rank',
			partition: partition.id,
			points: RANK_SIZE,
			curves: rankCurves.filter((c) => ids.has(c.measurementId)),
			statistics: null
		};
		packs.push(pack);
		files.set(`v1/${partition.rankFile}`, encodePack(pack));
		for (const file of partition.detailFiles) {
			const shardIds = new Set(measurements.filter((m) => m.detailFile === file).map((m) => m.id));
			files.set(
				`v1/${file}`,
				encodePack({
					kind: 'detail',
					partition: partition.id,
					points: GRID.length,
					curves: detailCurves.filter((c) => shardIds.has(c.measurementId)),
					statistics: null
				})
			);
		}
	}
	const manifest: Manifest = {
		formatVersion: 1,
		version: 'v1',
		builtAt: '2026-11-01',
		sources,
		files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: '' }))
	};
	files.set('manifest.json', json(manifest));
	const calls: string[] = [];
	const fetcher: typeof fetch = (input) => {
		const path = (input instanceof Request ? input.url : input.toString()).replace(
			'https://dataset.example/data/',
			''
		);
		calls.push(path);
		const bytes = files.get(path);
		return Promise.resolve(
			bytes ? new Response(Uint8Array.from(bytes)) : new Response(null, { status: 404 })
		);
	};
	const service = new AtlasService({
		baseUrl: 'https://dataset.example/data',
		fetch: fetcher,
		detailCacheSize: cacheSize
	});
	return { service, catalog, packs, files, calls, base, fetcher };
}

describe('atlas service', () => {
	it('loads only the requested catalog for search and attributes counts, variants and prices', async () => {
		const { service, calls } = fixture();
		const list = await service.products('iem');
		expect(calls).toEqual(['manifest.json', 'v1/catalog-iem.json.gz']);
		expect(list.find((p) => p.id === 'c')).toMatchObject({
			sourceCount: 3,
			measurementCount: 3,
			priceUsd: [1, 180],
			variantLabels: []
		});
		expect(list.find((p) => p.id === 'b')?.variantLabels).toEqual(['Verbatim (b-tune)']);
		const summary = await service.summary();
		expect(summary).toMatchObject({
			version: 'v1',
			builtAt: '2026-11-01',
			sources: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
			partitions: [
				{ id: 'iem-711', productCount: 4 },
				{ id: 'iem-5128', productCount: 1 }
			]
		});
	});
	it('lists per-source prices, per-source measurement counts and measurement metadata', async () => {
		const { service } = fixture();
		const c = (await service.products('iem')).find((p) => p.id === 'c');
		expect(c?.prices.map((p) => [p.sourceId, p.usd]).sort()).toEqual([
			['s1', 150],
			['s2', 180],
			['s3', 1]
		]);
		const summary = await service.summary();
		expect(summary.sources.map((s) => [s.id, s.measurementCount])).toEqual([
			['s1', 7],
			['s2', 2],
			['s3', 1]
		]);
		expect(await service.measurements(['b-tune', 'missing', 'd1'])).toEqual([
			{
				id: 'b-tune',
				productId: 'b',
				brand: 'Brand',
				model: 'B',
				partition: 'iem-711',
				sourceId: 's1',
				sourceName: 's1',
				variantLabel: 'Verbatim (b-tune)',
				variantKind: 'tuning'
			},
			expect.objectContaining({ id: 'd1', partition: 'iem-5128', variantKind: 'default' })
		]);
	});
	it('ranks an exact +3 dB shape first, excludes the reference, and never mixes rigs', async () => {
		const { service, calls } = fixture();
		const result = await service.similar({ productId: 'a', topK: 20 });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.partition).toBe('iem-711');
		expect(result.reference.measurementIds).toEqual(['a1', 'a2']);
		expect(result.results.map((r) => r.candidate.product.id)).toEqual(['b', 'c']);
		expect(result.results[0]?.distance).toBeCloseTo(0, 8);
		expect(result.results[0]?.offset).toBeCloseTo(3, 8);
		expect(result.results[0]?.coverage).toBe(1);
		expect(result.results[0]?.candidate.prices[0]).toMatchObject({
			usd: 50,
			sourceId: 's1',
			crawledAt: '2026-11-01'
		});
		expect(result.results[1]?.perSourceRange?.[1]).toBeGreaterThan(
			result.results[1]?.perSourceRange?.[0] ?? Infinity
		);
		expect(result.results[1]?.sourceCount).toBe(2);
		const range = result.results[1]?.perSourceRange;
		expect(range?.[1]).toBeCloseTo(2 * (range?.[0] ?? NaN), 6);
		expect(result.results[1]?.distance).toBeCloseTo(1.5 * (range?.[0] ?? NaN), 6);
		expect(calls.some((c) => c.includes('5128') || c.includes('detail-'))).toBe(false);
		const previous = calls.length;
		await service.similar({ productId: 'a' });
		expect(calls).toHaveLength(previous);
		expect(structuredClone(result)).toEqual(result);
	});
	it('keeps per-measurement tunings separate, opts in own tunings, and filters observed prices and sources', async () => {
		const { service } = fixture();
		const tuned = await service.similar({ productId: 'a', filters: { includeTunings: true } });
		expect(tuned.ok).toBe(true);
		if (!tuned.ok) return;
		expect(tuned.results.map((r) => r.candidate.id).sort()).toEqual(['a-tune', 'b', 'b-tune', 'c']);
		expect(tuned.results.find((r) => r.candidate.id === 'a-tune')).toMatchObject({
			sameProduct: true,
			candidate: { kind: 'tuning', variantLabel: 'Verbatim (a-tune)', measurementIds: ['a-tune'] }
		});
		const cheap = await service.similar({ productId: 'a', filters: { minPriceUsd: 40, maxPriceUsd: 55 } });
		expect(cheap.ok && cheap.results.map((r) => r.candidate.id)).toEqual(['b']);
		const source = await service.similar({ productId: 'a', filters: { sources: ['s2'] } });
		expect(source.ok && source.results.map((r) => r.candidate.id)).toEqual(['c']);
	});
	it('qualifies source distance ranges by the actual overlap under query weights', async () => {
		const { service, packs, files } = fixture();
		const pack = packs[0];
		const partial = pack?.curves.find((c) => c.measurementId === 'c2');
		if (!pack || !partial) throw new Error('fixture');
		partial.values.fill(NaN, 0, 60);
		files.set('v1/rank-iem-711.bin.gz', encodePack(pack));
		const result = await service.similar({
			productId: 'a',
			customBands: { 'sub-bass': 1, bass: 0, 'low-mid': 0, mid: 0, presence: 0, treble: 0, air: 0 }
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const match = result.results.find((r) => r.candidate.id === 'c');
		expect(match?.candidate.sources).toHaveLength(2);
		expect(match?.sourceCount).toBe(1);
		expect(match?.perSourceRange).toBeNull();
	});
	it('returns rig and identity errors rather than silently substituting a curve', async () => {
		const { service } = fixture();
		expect(await service.similar({ productId: 'a', partition: 'iem-5128' })).toMatchObject({
			ok: false,
			error: 'not-measured-on-rig'
		});
		expect(await service.similar({ productId: 'a', measurementId: 'd1' })).toMatchObject({
			ok: false,
			error: 'unknown-measurement'
		});
		expect(await service.similar({ productId: 'missing' })).toMatchObject({
			ok: false,
			error: 'unknown-product'
		});
		expect(await service.similar({ productId: 'e' })).toMatchObject({
			ok: false,
			error: 'not-measured-on-rig'
		});
		const explicit = await service.similar({ measurementId: 'e-fit' });
		expect(explicit.ok && explicit.reference.measurementIds).toEqual(['e-fit']);
	});
	it('uses the aligned per-frequency median and only applies source offsets when requested', () => {
		const { catalog, packs, base } = fixture();
		const partition = catalog.partitions[0];
		const pack = packs[0];
		if (!partition || !pack) throw new Error('fixture');
		const index = buildPartitionIndex(catalog, partition, pack);
		expect(index.products.get('a')?.values).toEqual(base);
		// c1/c2 have opposite-half deviations ±2/±4 and an irrelevant +8 dB level.
		expect(index.products.get('c')?.values[0]).toBeCloseTo(-3, 8);
		expect(index.products.get('c')?.values[119]).toBeCloseTo(5, 8);
		const offsets = Array.from(RANK_GRID, (_, i) => (i < 60 ? -4 : 4));
		pack.statistics = {
			spread: Array.from(RANK_GRID, () => 1),
			populationMedian: Array.from(base),
			sourceOffsets: { s2: offsets }
		};
		const harmonised = buildPartitionIndex(catalog, partition, pack, true);
		expect(harmonised.measurements.get('a2')?.values[0]).toBe(12);
		expect(harmonised.measurements.get('a2')?.values[119]).toBe(6);
		expect(index.measurements.get('a2')?.values[0]).toBe(8);
	});
	it('builds taste explanations, reports unused ratings, applies corrections, excludes all rated products', async () => {
		const { service } = fixture();
		const request = {
			partition: 'iem-711',
			items: [
				{ productId: 'a', rating: 'love' as const, strength: 1, soundRelated: true },
				{ productId: 'd', rating: 'like' as const, strength: 1, soundRelated: true },
				{ productId: 'e', rating: 'like' as const, strength: 1, soundRelated: false }
			]
		};
		const result = await service.taste(request);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.partition).toBe('iem-711');
		expect(result.model.tastes[0]?.members).toEqual(['a']);
		expect(result.model.confidence.level).toBe('limited');
		expect(result.unusedItems).toEqual([
			{ productId: 'd', measurementId: null, reason: 'not-measured-on-rig' },
			{ productId: 'e', measurementId: null, reason: 'not-sound-related' }
		]);
		expect(result.results.map((r) => r.candidate.id)).toEqual(['b', 'c']);
		expect(result.results[0]?.fit.fit).toBeCloseTo(0, 8);
		expect(result.results[0]?.fit.nearestLiked?.id).toBe('a');
		const corrected = await service.taste({ ...request, corrections: [{ tasteId: 0, bands: { bass: 2 } }] });
		expect(corrected.ok && corrected.results[0]?.fit.fit).toBeGreaterThan(0);
		expect(structuredClone(result)).toEqual(result);
	});
	it('defaults taste to the rig covering the most eligible rated items', async () => {
		const { service } = fixture();
		const result = await service.taste({
			items: ['a', 'b', 'd'].map((productId) => ({
				productId,
				rating: 'like',
				strength: 1,
				soundRelated: true
			}))
		});
		expect(result.ok && result.partition).toBe('iem-711');
		expect(result.ok && result.results.map((r) => r.candidate.id)).toEqual(['c']);
	});
	it('preserves multiple-reference objectives and refuses missing references on a chosen rig', async () => {
		const { service } = fixture();
		const result = await service.compare({ productIds: ['a', 'b'] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.results).toHaveLength(3);
		const endpoint = result.results.find((r) => r.candidate.id === 'a')?.tradeoff;
		expect(endpoint?.pareto).toBe(true);
		for (const distance of endpoint?.distances ?? []) expect(distance).toBeCloseTo(0, 8);
		expect(endpoint?.mean).toBeCloseTo(0, 8);
		expect(endpoint?.minimax).toBeCloseTo(0, 8);
		expect(result.results.find((r) => r.candidate.id === 'c')?.tradeoff).toMatchObject({ pareto: false });
		expect(result.results[0]?.tradeoff.distances).toHaveLength(2);
		expect(await service.compare({ productIds: ['a', 'd'] })).toMatchObject({
			ok: false,
			error: 'not-measured-on-rig'
		});
	});
	it('loads detail shards on demand, retains variants/provenance, aligns spread and averages channels', async () => {
		const { service, calls } = fixture();
		const detail = await service.productDetail('a');
		expect(detail.ok).toBe(true);
		if (!detail.ok) return;
		expect(detail.measurements).toHaveLength(3);
		expect(detail.measurements[0]).toMatchObject({
			measurement: { imbalanceDb: 2, provenance: { sourceId: 's1' } },
			curves: [{ channel: 'L' }, { channel: 'R' }]
		});
		expect(detail.spread[0]?.min).toEqual(detail.spread[0]?.max);
		expect(calls.filter((c) => c.includes('detail-'))).toEqual(['v1/detail-iem-711-a.bin.gz']);
		const curves = await service.curves(['a1', 'a2', 'missing'], { channel: 'avg' });
		expect(curves[0]?.values?.[0]).toBe(0);
		expect(curves[1]?.values?.[0]).toBe(8);
		expect(curves[2]?.error).toBe('unknown-measurement');
		expect((await service.curves(['a1'], { channel: 'R' }))[0]?.values?.[0]).toBe(1);
		expect(calls.filter((c) => c.includes('detail-'))).toHaveLength(1);
		const variantDetail = await service.productDetail('c');
		expect(variantDetail.ok && variantDetail.spread[0]?.measurementIds).toEqual(['c1', 'c2']);
		expect(variantDetail.ok && variantDetail.variationSpread[0]?.measurementIds).toEqual([
			'c1',
			'c2',
			'c-fit'
		]);
	});
	it('evicts least recently used decoded detail shards and deduplicates concurrent fetches', async () => {
		const { service, calls } = fixture(1);
		await Promise.all([service.curves(['a1']), service.curves(['a2'])]);
		await service.curves(['b1']);
		await service.curves(['a1']);
		expect(calls.filter((c) => c.includes('detail-'))).toEqual([
			'v1/detail-iem-711-a.bin.gz',
			'v1/detail-iem-711-b.bin.gz',
			'v1/detail-iem-711-a.bin.gz'
		]);
	});
	it('parses private uploads, requires an explicit rig for ranking, and exports real PEQ results', async () => {
		const { service, calls } = fixture();
		expect(service.parseUpload('garbage', 'bad.txt')).toMatchObject({ ok: false });
		const upload = service.parseUpload(
			Array.from(GRID, (hz, i) => `${hz} ${i < 120 ? 0 : 2}`).join('\n'),
			'mine.txt'
		);
		expect(upload.ok).toBe(true);
		if (!upload.ok) return;
		expect(calls).toHaveLength(0);
		expect(upload.values).toHaveLength(240);
		expect(upload.rankValues).toHaveLength(120);
		expect(await service.similar({ uploadId: upload.uploadId })).toMatchObject({
			ok: false,
			error: 'partition-required'
		});
		const similar = await service.similar({ uploadId: upload.uploadId, partition: 'iem-711' });
		expect(similar.ok && similar.reference.uploadId).toBe(upload.uploadId);
		const peq = await service.peq({
			uploadId: upload.uploadId,
			target: { kind: 'curve', values: upload.values },
			maxFilters: 0
		});
		expect(peq.ok).toBe(true);
		if (!peq.ok) return;
		expect(peq.result.residualDistanceDb).toBeCloseTo(0, 8);
		expect(peq.apo).toContain('Preamp:');
		expect(peq.wavelet).toContain('GraphicEQ:');
		expect(JSON.parse(peq.json)).toMatchObject({ sampleRate: 48000, filters: [] });
		const productPeq = await service.peq({
			productId: 'a',
			target: { kind: 'product', productId: 'b' },
			maxFilters: 0
		});
		expect(productPeq.ok && productPeq.result.residualDistanceDb).toBeCloseTo(0, 8);
		expect(await service.peq({ productId: 'a', target: { kind: 'product', productId: 'd' } })).toMatchObject({
			ok: false,
			error: 'not-measured-on-rig'
		});
	});
	it('decodes actual gzip and recovers a failed lazy load without caching the failure', async () => {
		const { files, fetcher } = fixture();
		const catalog = files.get('v1/catalog-iem.json.gz');
		if (!catalog) throw new Error('fixture');
		const compressed = await new Response(
			new Blob([Uint8Array.from(catalog)]).stream().pipeThrough(new CompressionStream('gzip'))
		).arrayBuffer();
		files.set('v1/catalog-iem.json.gz', new Uint8Array(compressed));
		let fail = true;
		const service = new AtlasService({
			baseUrl: 'https://dataset.example/data/',
			fetch: (input, init) => {
				if (fail) {
					fail = false;
					return Promise.resolve(new Response(null, { status: 503 }));
				}
				return fetcher(input, init);
			}
		});
		await expect(service.products('iem')).rejects.toThrow('503');
		expect(await service.products('iem')).toHaveLength(5);
	});
});
