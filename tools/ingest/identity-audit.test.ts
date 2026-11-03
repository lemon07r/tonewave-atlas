import { describe, expect, it } from 'vitest';
import type { Measurement, Product } from '#core/dataset/types.ts';
import { identityAudit, type IdentityOrigin } from './identity-audit.ts';

const product = (id: string, brand: string, model = 'Reference', form: Product['form'] = 'iem'): Product => ({
	id,
	brand,
	model,
	form,
	measurementIds: []
});
function fixture() {
	const origins = new Map<string, IdentityOrigin>();
	const row = (
		id: string,
		key: string,
		brand: string,
		sourceId: string,
		values: number[],
		partition = 'iem-711',
		placeholder = false
	) => {
		origins.set(id, { key, brand, model: 'Reference', placeholder });
		const variant: Pick<Measurement['variant'], 'isDefault'> = { isDefault: true };
		return {
			measurement: {
				id,
				productId: 'merged',
				sourceId,
				partition,
				variant
			} satisfies Pick<Measurement, 'id' | 'productId' | 'sourceId' | 'partition'> & {
				variant: Pick<Measurement['variant'], 'isDefault'>;
			},
			rank: { values: Float64Array.from(values) }
		};
	};
	return { origins, row };
}

describe('repeatable identity diagnostics', () => {
	it('uses final demotions and promotions for both threshold calibration and merge comparisons', () => {
		const { origins, row } = fixture();
		const a = row('a', 'old-a', 'Campfire', 's1', [0, 0, 0]);
		const b = row('b', 'old-a', 'Campfire', 's2', [0, 2, 0]);
		const c = row('c', 'old-b', 'Campfire Audio', 's3', [0, 6, 0]);
		b.measurement.variant.isDefault = false;
		const demoted = identityAudit([product('merged', 'Campfire')], [a, b, c], origins, {});
		expect(demoted.thresholds.every((t) => t.p90Db === null)).toBe(true);
		expect(demoted.merges[0]?.comparisons[0]?.distanceDb).toBeCloseTo(Math.sqrt(8), 10);
		b.measurement.variant.isDefault = true;
		const promoted = identityAudit([product('merged', 'Campfire')], [a, b, c], origins, {});
		expect(promoted.thresholds[0]?.sameProductPairs).toBe(1);
		expect(promoted.thresholds[0]?.p90Db).toBeCloseTo(Math.sqrt(8 / 9), 10);
	});
	it('reports each merged part and independently derived LS RMS/p90, flagging rather than blocking outliers', () => {
		const { origins, row } = fixture();
		const rows = [
			row('a', 'old-a', 'Campfire', 's1', [100, 100, 100]),
			row('b', 'old-a', 'Campfire', 's2', [20, 22, 20]),
			row('c', 'old-b', 'Campfire Audio', 's3', [0, 6, 0])
		];
		const before = structuredClone(rows);
		const audit = identityAudit([product('merged', 'Campfire')], rows, origins, {});
		expect(audit.thresholds).toHaveLength(1);
		expect(audit.thresholds).toMatchObject([{ partition: 'iem-711', sameProductPairs: 1 }]);
		expect(audit.thresholds[0]?.p90Db).toBeCloseTo(Math.sqrt(8 / 9), 10);
		expect(audit.merges).toHaveLength(1);
		expect(audit.merges[0]?.parts.map((p) => p.measurements)).toEqual([['a', 'b'], ['c']]);
		expect(audit.merges[0]?.comparisons).toHaveLength(1);
		expect(audit.merges[0]?.comparisons).toMatchObject([
			{ partition: 'iem-711', overlapBins: 3, aboveSameProductP90: true }
		]);
		expect(audit.merges[0]?.comparisons[0]?.distanceDb).toBeCloseTo(Math.sqrt(50 / 9), 10);
		expect(rows).toEqual(before);
		expect(identityAudit([product('merged', 'Campfire')], [...rows].reverse(), origins, {})).toEqual(audit);
	});
	it('reports absent shared rigs or calibration honestly, including single-part placeholder recovery', () => {
		const { origins, row } = fixture();
		const rows = [
			row('a', 'a', 'Unbranded (sai)', 's1', [0, 1, 0], 'iem-711', true),
			row('b', 'b', 'Maker', 's2', [0, 1, 0], 'iem-5128')
		];
		const audit = identityAudit([product('merged', 'Maker')], rows, origins, {});
		expect(audit.merges[0]).toMatchObject({
			reasons: ['brand-key', 'placeholder'],
			comparisons: [],
			evidence: 'no shared-rig default evidence'
		});
		expect(audit.thresholds.every((t) => t.p90Db === null)).toBe(true);
		expect(
			identityAudit([product('merged', 'Maker')], rows.slice(0, 1), origins, {}).merges[0]?.reasons
		).toContain('placeholder');
	});
	it('keeps cross-brand near names, cross-form identities and bare CJK tokens report-only', () => {
		const products = [
			product('a', 'Maker', 'Reference'),
			product('b', 'Other', 'Referenc'),
			product('c', 'Maker Audio', 'Reference', 'headphone'),
			product('d', 'Juzear', 'x Z Reviews Defiant 鳴神'),
			product('e', 'Other', 'Reference')
		];
		const audit = identityAudit(products, [], new Map(), {});
		expect(audit.remainingAcrossBrandKeys[0]?.map((p) => p.id)).toEqual(['a', 'e']);
		expect(audit.nearNamesAcrossBrandKeys).toContainEqual({ left: 'b', right: 'a' });
		expect(audit.crossForm[0]?.map((p) => p.id)).toEqual(['a', 'c']);
		expect(audit.ambiguousCjkModels).toEqual([
			{ id: 'd', brand: 'Juzear', model: 'x Z Reviews Defiant 鳴神' }
		]);
		expect(products).toHaveLength(5);
	});
	it('reports plus-sign splits of the former punctuation-only key without merging them again', () => {
		const { origins, row } = fixture();
		const a = row('a', 'nm2', 'NF Audio', 's1', [0, 1, 0]);
		const b = row('b', 'nm2plus', 'NF Audio', 's1', [0, 2, 0]);
		a.measurement.productId = 'nm2';
		b.measurement.productId = 'nm2plus';
		const originA = origins.get('a'),
			originB = origins.get('b');
		if (!originA || !originB) throw new Error('Missing split fixture');
		originA.model = 'NM2';
		originB.model = 'NM2+';
		const audit = identityAudit(
			[product('nm2', 'NF Audio', 'NM2'), product('nm2plus', 'NF Audio', 'NM2+')],
			[a, b],
			origins,
			{}
		);
		expect(audit.legacyNormalisationSplits).toEqual([
			{
				legacyKey: 'iem:nfaudio:nm2',
				products: [
					{ productId: 'nm2', measurements: ['a'] },
					{ productId: 'nm2plus', measurements: ['b'] }
				]
			}
		]);
		expect(audit.merges).toEqual([]);
	});
});
