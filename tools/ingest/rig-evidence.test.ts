import { describe, expect, it } from 'vitest';
import { rigEvidence } from './rig-evidence.ts';
import { sourceFor } from './transform.ts';
import { RANK_GRID } from '#core/grid.ts';
import type { IndexedCurve } from '#core/atlas/index.ts';
import type { Source } from '#core/dataset/types.ts';

function fixture() {
	// Five 711 controls allow >=3 OTHER 711 references even inside each training fold.
	const names = ['a', 'b', 'c', 'd', 'e', 'x', 'y', 'z', 'u711', 'u5128', 'middle', 'small'];
	const sources: Source[] = names.map((id, i) =>
		sourceFor(
			{
				id,
				username: id,
				name: id,
				url: `https://${id}.invalid/`,
				dbType: i >= 5 && i < 8 ? '5128' : 'IEMs'
			},
			i < 5 ? 'rig_description="clone 711"' : '',
			'date',
			{}
		)
	);
	const rows: IndexedCurve[] = [];
	for (let product = 0; product < 16; product++)
		for (const [i, s] of sources.entries()) {
			if (s.id === 'small' && product >= 3) continue;
			const amount = ['x', 'y', 'z', 'u5128'].includes(s.id) ? 1 : s.id === 'middle' ? 0.5 : 0;
			const id = `m-${s.id}-${product}`;
			rows.push({
				measurement: {
					id,
					sourceId: s.id,
					productId: `p-${product}`,
					partition: s.partition,
					variant: { id: `v-${id}`, label: '', file: id, kind: 'default', isDefault: true },
					channels: ['L'],
					channelContributions: [],
					imbalanceDb: null,
					pairedBins: 0,
					dated: {},
					lastModified: {},
					price: null,
					reviewUrl: null,
					detailFile: '',
					provenance: {
						sourceId: s.id,
						databaseUrl: s.url,
						originalUrls: [],
						processing: [],
						calibrationUrl: null
					},
					warnings: []
				},
				// Independent construction: alternating +/-2 dB direction has zero LS level; constant
				// levels and the shared product's arbitrary cosine shape must cancel exactly.
				values: Float64Array.from(
					RANK_GRID,
					(_, bin) => 60 + i * 7 + Math.cos(bin / (product + 2)) + amount * (bin % 2 ? 2 : -2)
				)
			});
		}
	return { sources, rows };
}

describe('signed rig evidence', () => {
	it('does not admit unknown rigs when a held-out control fails a threshold trained without it', () => {
		const { sources, rows } = fixture();
		const biased = rows.map((r) =>
			r.measurement.sourceId === 'a'
				? { ...r, values: Float64Array.from(r.values, (v, bin) => v + 0.7 * (bin % 2 ? 2 : -2)) }
				: r
		);
		const report = rigEvidence(sources, biased, 40);
		// The all-control threshold moves to .85 and calls this .7 control "711";
		// the other controls alone set .5, so the held-out control is actually misclassified.
		expect(report.sources.filter((s) => !s.control).every((s) => s.class === 'unknown')).toBe(true);
		expect(report.loco.controls.find((c) => c.source === 'a')).toMatchObject({
			expected: '711',
			predicted: '5128',
			correct: false
		});
		expect(report.loco.passes).toBe(false);
		expect(report.loco.controls.find((c) => c.source === 'a')?.threshold).toBeCloseTo(0.5, 10);
		for (const control of report.loco.controls.find((c) => c.source === 'a')?.training ?? [])
			expect(control.projection).toBeCloseTo(control.control === '711' ? 0 : 1, 10);
	});
	it('recovers independently constructed 0/1 projections, abstains at the midpoint and below stability support', () => {
		const { sources, rows } = fixture();
		const r = rigEvidence(sources, rows, 40);
		expect(r.separated).toBe(true);
		expect(r.threshold).toBeCloseTo(0.5, 10);
		expect(r.minimumProducts).toBe(4);
		expect(r.loco).toMatchObject({ passes: true, correct: 8 });
		for (const fold of r.loco.controls) {
			expect(fold.threshold).toBeCloseTo(0.5, 10);
			expect(fold.training.some((c) => c.source === fold.source)).toBe(false);
		}
		expect(r.direction.mask.every(Boolean)).toBe(true);
		r.direction.delta.forEach((d, i) => {
			expect(d).toBeCloseTo(i % 2 ? 2 : -2, 10);
		});
		for (const id of ['u711', 'u5128']) {
			const s = r.sources.find((s) => s.source === id);
			expect(s?.class).toBe('evidenced');
			expect(s?.family).toBe(id === 'u711' ? '711' : '5128');
			expect(s?.projection).toBeCloseTo(id === 'u711' ? 0 : 1, 10);
		}
		expect(r.sources.find((s) => s.source === 'middle')?.class).toBe('unknown');
		expect(r.sources.find((s) => s.source === 'small')?.class).toBe('unknown');
		expect(r.stability[0]?.controls.every((c) => c.correct === 200)).toBe(true);
	});
	it('leaves a control out of both reference and direction, without training on non-default variants', () => {
		const { sources, rows } = fixture();
		const selected = rows.filter(
			(r) => !(['y', 'z'].includes(r.measurement.sourceId) && Number(r.measurement.productId.slice(2)) >= 8)
		);
		const stock = rigEvidence(sources, selected, 40);
		expect(stock.sources.find((s) => s.source === 'x')?.directionProducts).toBe(8);
		expect(stock.direction.products).toBe(16);
		const extra = rows.slice(0, 3).map((r) => ({
			...r,
			measurement: {
				...r.measurement,
				id: `copy-${r.measurement.id}`,
				variant: { ...r.measurement.variant, kind: 'unit' as const, isDefault: false }
			},
			values: Float64Array.from(r.values, (v) => v * 10)
		}));
		expect(rigEvidence(sources, [...selected, ...extra], 40)).toEqual(stock);
	});
	it('abstains rather than creating evidence when the verified rigs have no systematic difference', () => {
		const { sources, rows } = fixture();
		const flat = rows.map((r) => ({ ...r, values: Float64Array.from(RANK_GRID, (_, i) => 70 + i / 100) }));
		const r = rigEvidence(sources, flat, 40);
		expect(r.separated).toBe(false);
		expect(r.threshold).toBeNull();
		expect(r.minimumProducts).toBeNull();
		expect(r.sources.filter((s) => !s.control).every((s) => s.class === 'unknown')).toBe(true);
	});
});
