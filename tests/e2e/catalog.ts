import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Catalog, Manifest, Product, Source } from '../../src/core/dataset/types.ts';
import { sourceOnPartition } from '../../src/lib/sources.ts';

const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8')) as Manifest;
const catalog = JSON.parse(
	gunzipSync(readFileSync(`static/data/${manifest.version}/catalog-iem.json.gz`)).toString()
) as Catalog;
const defaults = catalog.measurements.filter((measurement) => measurement.variant.kind === 'default');

export function measurementReviewer(measurementId: string): string {
	const measurement = catalog.measurements.find((entry) => entry.id === measurementId);
	if (!measurement) throw new Error(`Missing measurement ${measurementId}`);
	return measurement.sourceId;
}

/** Real reference support plus enough source-only candidates to exercise a full 20-row page. */
export function reviewerForReference(
	productId: string,
	partition = 'iem-711'
): Source & { selectedPartition: string } {
	const measurements = defaults.filter((measurement) => measurement.partition === partition);
	const referenceSources = new Set(
		measurements
			.filter((measurement) => measurement.productId === productId)
			.map((measurement) => measurement.sourceId)
	);
	if (referenceSources.size < 2)
		throw new Error(
			`Reference ${productId} needs multiple reviewers on ${partition} to test pooling exclusions.`
		);
	const productsBySource = new Map<string, Set<string>>();
	for (const measurement of measurements) {
		const products = productsBySource.get(measurement.sourceId) ?? new Set<string>();
		if (measurement.productId !== productId) products.add(measurement.productId);
		productsBySource.set(measurement.sourceId, products);
	}
	const sources = catalog.sources.filter((source) => sourceOnPartition(source, partition));
	const reviewer = sources
		.filter(
			(source) =>
				referenceSources.has(source.id) &&
				(productsBySource.get(source.id)?.size ?? 0) >= 20 &&
				// The reviewer search must uniquely identify the selected checkbox.
				sources.filter((other) => other.name.toLowerCase().includes(source.name.toLowerCase())).length === 1
		)
		.sort(
			(a, b) =>
				(productsBySource.get(b.id)?.size ?? 0) - (productsBySource.get(a.id)?.size ?? 0) ||
				a.id.localeCompare(b.id)
		)[0];
	if (!reviewer)
		throw new Error(
			`No reviewer supports reference ${productId} and a full page of candidates on ${partition}.`
		);
	return { ...reviewer, selectedPartition: partition };
}

/** Choose a real default reference compatible with every rig the upload journey exercises. */
export function productOnRigs(partitions: readonly string[]): Product {
	const support = new Map<string, Set<string>>();
	const counts = new Map<string, number>();
	for (const measurement of defaults) {
		const rigs = support.get(measurement.productId) ?? new Set<string>();
		rigs.add(measurement.partition);
		support.set(measurement.productId, rigs);
		counts.set(measurement.productId, (counts.get(measurement.productId) ?? 0) + 1);
	}
	const product = catalog.products
		.filter((item) => partitions.every((partition) => support.get(item.id)?.has(partition)))
		.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
	if (!product)
		throw new Error(`No default reference is measured on every requested rig: ${partitions.join(', ')}.`);
	return product;
}
