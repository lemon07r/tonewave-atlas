import { median } from '#core/analysis/common.ts';
import type { Measurement, Product } from '#core/dataset/types.ts';
import { ambiguousCjkModel, canonicalBrandKey, identityKey, modelIdentity } from './identity-keys.ts';
import { normalise, suspiciousNames } from './transform.ts';

export interface IdentityOrigin {
	brand: string;
	model: string;
	key: string;
	placeholder: boolean;
}
interface Row {
	measurement: Pick<Measurement, 'id' | 'productId' | 'sourceId' | 'partition'> & {
		variant: Pick<Measurement['variant'], 'isDefault'>;
	};
	rank: { values: Float64Array };
}

const ordered = <T extends { id: string }>(rows: T[]): T[] =>
	rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
function centered(values: Float64Array): Float64Array {
	const finite = [...values].filter(Number.isFinite);
	const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
	return values.map((v) => v - mean);
}
function consensus(rows: readonly Row[]): Float64Array {
	const curves = rows.map((r) => centered(r.rank.values));
	return Float64Array.from({ length: curves[0]?.length ?? 0 }, (_, i) =>
		median(curves.map((c) => c[i] ?? NaN).filter(Number.isFinite))
	);
}
function distance(a: Float64Array, b: Float64Array) {
	const differences = [...a].map((v, i) => v - (b[i] ?? NaN)).filter(Number.isFinite);
	if (differences.length < 2) return null;
	const mean = differences.reduce((x, y) => x + y, 0) / differences.length;
	return {
		distanceDb: Math.sqrt(differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / differences.length),
		overlapBins: differences.length
	};
}
function p90(values: number[]): number | null {
	if (!values.length) return null;
	values.sort((a, b) => a - b);
	const index = (values.length - 1) * 0.9,
		low = Math.floor(index);
	return (values[low] ?? 0) + ((values[Math.ceil(index)] ?? 0) - (values[low] ?? 0)) * (index - low);
}

/** Diagnostic only. Distances never admit/reject merges, change curves, or assign forms. */
export function identityAudit(
	products: readonly Product[],
	rows: readonly Row[],
	origins: ReadonlyMap<string, IdentityOrigin>,
	aliases: Readonly<Record<string, string>>
) {
	const origin = (r: Row): IdentityOrigin => {
		const value = origins.get(r.measurement.id);
		if (!value) throw new Error(`Missing identity origin: ${r.measurement.id}`);
		return value;
	};
	const defaults = rows.filter((r) => r.measurement.variant.isDefault);
	const rawParts = Map.groupBy(defaults, (r) => `${r.measurement.partition}\0${origin(r).key}`);
	const calibration = new Map<string, number[]>();
	for (const part of rawParts.values()) {
		const partition = part[0]?.measurement.partition;
		if (!partition) continue;
		const sources = [...Map.groupBy(part, (r) => r.measurement.sourceId).values()].map(consensus);
		const distances = calibration.get(partition) ?? [];
		for (let i = 0; i < sources.length; i++)
			for (let j = i + 1; j < sources.length; j++) {
				const d = distance(sources[i] ?? new Float64Array(), sources[j] ?? new Float64Array());
				if (d) distances.push(d.distanceDb);
			}
		calibration.set(partition, distances);
	}
	const thresholds = [...calibration]
		.sort(([a], [b]) => a.localeCompare(b, 'en'))
		.map(([partition, distances]) => ({
			partition,
			sameProductPairs: distances.length,
			p90Db: p90(distances)
		}));
	const merges = [];
	for (const [productId, members] of Map.groupBy(rows, (r) => r.measurement.productId)) {
		const groups = [...Map.groupBy(members, (r) => origin(r).key)]
			.sort(([a], [b]) => a.localeCompare(b, 'en'))
			.map(([, group]) => group);
		const placeholder = members.some((r) => origin(r).placeholder);
		const brandMerge = new Set(members.map((r) => identityKey(origin(r).brand))).size > 1;
		if (!placeholder && !brandMerge) continue;
		const parts = groups.map((group) => {
			const first = group[0];
			if (!first) throw new Error('Empty identity part');
			return {
				id: origin(first).key,
				brand: origin(first).brand,
				model: origin(first).model,
				sources: [...new Set(group.map((r) => r.measurement.sourceId))].sort(),
				measurements: group.map((r) => r.measurement.id).sort()
			};
		});
		const comparisons = [];
		for (let i = 0; i < groups.length; i++)
			for (let j = i + 1; j < groups.length; j++) {
				const left = groups[i] ?? [],
					right = groups[j] ?? [];
				const leftDefaults = Map.groupBy(
					left.filter((r) => r.measurement.variant.isDefault),
					(r) => r.measurement.partition
				);
				const rightDefaults = Map.groupBy(
					right.filter((r) => r.measurement.variant.isDefault),
					(r) => r.measurement.partition
				);
				for (const [partition, a] of leftDefaults) {
					const b = rightDefaults.get(partition);
					if (!b) continue;
					const balanced = (rs: Row[]) => {
						const perSource = [...Map.groupBy(rs, (r) => r.measurement.sourceId).values()].map((g) => {
							const first = g[0];
							if (!first) throw new Error('Empty source consensus');
							return { ...first, rank: { values: consensus(g) } };
						});
						return consensus(perSource);
					};
					const d = distance(balanced(a), balanced(b));
					if (!d) continue;
					const threshold = thresholds.find((t) => t.partition === partition)?.p90Db ?? null;
					comparisons.push({
						left: parts[i]?.id,
						right: parts[j]?.id,
						partition,
						...d,
						sameProductP90Db: threshold,
						aboveSameProductP90: threshold === null ? null : d.distanceDb > threshold
					});
				}
			}
		merges.push({
			productId,
			reasons: [...(brandMerge ? ['brand-key'] : []), ...(placeholder ? ['placeholder'] : [])],
			parts,
			comparisons,
			evidence: comparisons.length ? 'shared-rig default rank medians' : 'no shared-rig default evidence'
		});
	}
	const nearNames = [
		...Map.groupBy(products, (p) => `${p.form}:${identityKey(modelIdentity(p.model))}`).values()
	]
		.filter((ps) => new Set(ps.map((p) => canonicalBrandKey(p.brand, aliases))).size > 1)
		.map((ps) => ordered(ps.map(({ id, brand, model, form }) => ({ id, brand, model, form }))));
	const crossForm = [
		...Map.groupBy(
			products,
			(p) => `${canonicalBrandKey(p.brand, aliases)}:${identityKey(modelIdentity(p.model))}`
		).values()
	]
		.filter((ps) => new Set(ps.map((p) => p.form)).size > 1)
		.map((ps) => ordered(ps.map(({ id, brand, model, form }) => ({ id, brand, model, form }))));
	const byId = new Map(products.map((p) => [p.id, p]));
	const legacySplits = [
		...Map.groupBy(
			rows,
			(r) =>
				`${byId.get(r.measurement.productId)?.form}:${normalise(origin(r).brand)}:${normalise(origin(r).model)}`
		)
	]
		.filter(([, rs]) => new Set(rs.map((r) => r.measurement.productId)).size > 1)
		.map(([legacyKey, rs]) => ({
			legacyKey,
			products: [...Map.groupBy(rs, (r) => r.measurement.productId)]
				.map(([productId, members]) => ({
					productId,
					measurements: members.map((r) => r.measurement.id).sort()
				}))
				.sort((a, b) => a.productId.localeCompare(b.productId, 'en'))
		}))
		.sort((a, b) => a.legacyKey.localeCompare(b.legacyKey, 'en'));
	const nearAcrossBrands = suspiciousNames(
		products.map((p) => ({ ...p, brand: 'audit across brands' }))
	).filter(({ left, right }) => {
		const a = byId.get(left),
			b = byId.get(right);
		return a && b && canonicalBrandKey(a.brand, aliases) !== canonicalBrandKey(b.brand, aliases);
	});
	return {
		method:
			'Unharmonised full rank grid; finite per-curve LS centering, per-source median then equal-source median, shared-finite-bin LS RMS. Per-rig p90 (linear interpolation) uses distinct-source pairs within original identity parts, before these merges; missing evidence/threshold is null, never a veto.',
		thresholds,
		legacyNormalisationSplits: legacySplits,
		merges: merges.sort((a, b) => a.productId.localeCompare(b.productId, 'en')),
		remainingAcrossBrandKeys: nearNames.sort((a, b) => (a[0]?.id ?? '').localeCompare(b[0]?.id ?? '', 'en')),
		nearNamesAcrossBrandKeys: nearAcrossBrands,
		crossForm: crossForm.sort((a, b) => (a[0]?.id ?? '').localeCompare(b[0]?.id ?? '', 'en')),
		ambiguousCjkModels: ordered(
			products.filter((p) => ambiguousCjkModel(p.model)).map(({ id, brand, model }) => ({ id, brand, model }))
		),
		modelAnnotations: [
			...new Map(
				rows
					.filter((r) => modelIdentity(origin(r).model) !== origin(r).model.trim().replace(/\s+/g, ' '))
					.map((r) => [
						origin(r).key,
						{ original: origin(r).model, keyModel: modelIdentity(origin(r).model) }
					])
			).values()
		]
	};
}
