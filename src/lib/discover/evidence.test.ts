import { expect, test } from 'vitest';
import type { ProductListItem, MeasurementInfo, CompareResult } from '#core/atlas/types.ts';
import { RANK_GRID } from '#core/grid.ts';
import { compareEvidence, referenceDiagnostic } from './evidence.ts';

const product: ProductListItem = {
	id: 'a',
	brand: 'Brand',
	model: 'A',
	partitions: ['rig-a', 'rig-b'],
	defaultPartitions: ['rig-a'],
	sourceCount: 1,
	measurementCount: 2,
	variantLabels: [],
	priceUsd: null,
	prices: []
};
const measurement: MeasurementInfo = {
	id: 'variant',
	productId: 'a',
	brand: 'Brand',
	model: 'A',
	partition: 'rig-b',
	sourceId: 's',
	sourceName: 'Reviewer',
	variantLabel: 'High impedance',
	variantKind: 'tuning'
};
const item = { productId: 'a', rating: 'like' as const, strength: 0.6, soundRelated: true };
test('diagnoses missing defaults and explicit variants independently without substituting either', () => {
	expect(referenceDiagnostic(item, product, [measurement], 'rig-b')).toMatchObject({
		status: 'missing-rig',
		partitions: ['rig-a']
	});
	expect(
		referenceDiagnostic({ ...item, measurementId: 'variant' }, product, [measurement], 'rig-a')
	).toMatchObject({ status: 'missing-rig', partitions: ['rig-b'], variant: 'High impedance' });
	expect(
		referenceDiagnostic({ ...item, measurementId: 'wrong' }, product, [measurement], 'rig-a').status
	).toBe('unknown-measurement');
	expect(
		referenceDiagnostic(
			{ ...item, measurementId: 'variant' },
			product,
			[{ ...measurement, productId: 'other' }],
			'rig-b'
		).status
	).toBe('unknown-measurement');
});
test('calculates per-reference band evidence from rank values with independent level offsets', () => {
	const result: CompareResult = {
		ok: true,
		partition: 'rig-a',
		harmonised: false,
		sourceMode: 'coverage',
		rankFrequencies: RANK_GRID,
		rankWeights: new Float64Array(RANK_GRID.length).fill(1),
		treblePenalty: 1,
		references: [0, 10].map((level) => ({
			productId: String(level),
			uploadId: null,
			measurementIds: [],
			sources: [],
			rankCurve: new Float64Array(RANK_GRID.length).fill(level)
		})),
		results: [],
		counts: { candidates: 0, pareto: 0 },
		caveats: []
	};
	const curve = Float64Array.from(RANK_GRID, (hz) => (hz < 200 ? 2 : 0));
	const evidence = compareEvidence(result, curve, ['First', 'Second']);
	expect(evidence.map((e) => e.label)).toEqual(['First', 'Second']);
	const first = evidence[0]?.bands.find((band) => band.band === 'sub-bass');
	const second = evidence[1]?.bands.find((band) => band.band === 'sub-bass');
	expect(first?.meanDb).toBeCloseTo(2 * (1 - 40 / 120), 6);
	expect(second?.meanDb).toBeCloseTo(first?.meanDb ?? NaN, 6);
});
