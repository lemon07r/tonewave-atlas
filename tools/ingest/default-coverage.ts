import type { Measurement, Product } from '#core/dataset/types.ts';
import type { Phone } from './common.ts';
import { defaultVariantIndex } from './transform.ts';
import { labelledState } from './switches.ts';

interface Row {
	measurement: Measurement;
}
interface Decision {
	productId: string;
	preferred: string | null;
}

function defaultCoverage(rows: readonly Row[]) {
	const measurements = rows.map((r) => r.measurement);
	const count = (key: (m: Measurement) => string) => {
		const groups = [...Map.groupBy(measurements, key).values()];
		return {
			groups: groups.length,
			withoutDefault: groups.filter((g) => !g.some((m) => m.variant.isDefault)).length,
			multipleDefaults: groups.filter((g) => g.filter((m) => m.variant.isDefault).length > 1).length
		};
	};
	return {
		productPartitions: count((m) => `${m.productId}|${m.partition}`),
		productSources: count((m) => `${m.productId}|${m.sourceId}`),
		productSourcePartitions: count((m) => `${m.productId}|${m.sourceId}|${m.partition}`)
	};
}

/** Keep source order as the final tie-break; metadata kind survives fallback selection. */
function fallback(product: Product, ms: readonly Measurement[]): Measurement {
	const phone: Phone = {
		brand: product.brand,
		name: product.model,
		file: ms.map((m) => m.variant.file),
		suffix: ms.map((m) => m.variant.label),
		price: null,
		reviewLink: null
	};
	const unitsOnly = ms.every((m) => m.variant.kind === 'unit');
	const fitOnly = ms.every((m) => m.variant.kind === 'fit');
	const sampleNumber = (m: Measurement) =>
		Number(
			`${m.variant.file} ${m.variant.label}`.match(/\b(?:sample|unit|s)\s*[:#-]?\s*(\d+)\b/i)?.[1] ?? Infinity
		);
	const selected = unitsOnly
		? [...ms].sort((a, b) => sampleNumber(a) - sampleNumber(b))[0]
		: fitOnly
			? (ms.find((m) => /\b(?:stock|standard|default|original|neutral)\b/i.test(m.variant.label)) ?? ms[0])
			: ms[defaultVariantIndex(phone) ?? 0];
	if (!selected) throw new Error('Cannot choose a default from an empty group');
	return selected;
}

function groups(
	products: ReadonlyMap<string, Product>,
	rows: readonly Row[],
	decisions: readonly Decision[]
) {
	const preferred = new Map(decisions.map((d) => [d.productId, d.preferred]));
	return [
		...Map.groupBy(
			rows.map((r) => r.measurement),
			(m) => m.productId
		)
	].flatMap(([id, ms]) => {
		const product = products.get(id);
		if (!product) throw new Error(`Default coverage: missing product ${id}`);
		const state = labelledState(product, ms);
		return [...Map.groupBy(ms, (m) => m.partition)].map(([partition, partitionRows]) => ({
			product,
			partition,
			partitionRows,
			state,
			preferred: preferred.get(id) ?? null,
			sources: Map.groupBy(partitionRows, (m) => m.sourceId)
		}));
	});
}

function singletonFallback(ms: readonly Measurement[]): boolean {
	return ms.length === 1 && ms.some((m) => ['unit', 'fit', 'unknown'].includes(m.variant.kind));
}

/** Fatal publication gate, including the sole permitted source-coverage exception. */
export function assertDefaultCoverage(
	products: ReadonlyMap<string, Product>,
	rows: readonly Row[],
	decisions: readonly Decision[]
): void {
	for (const g of groups(products, rows, decisions)) {
		if (!g.partitionRows.some((m) => m.variant.isDefault))
			throw new Error(`Default coverage: no default for ${g.product.id} / ${g.partition}`);
		for (const [source, ms] of g.sources) {
			if (ms.some((m) => m.variant.isDefault)) continue;
			if (
				!singletonFallback(ms) &&
				g.preferred &&
				!ms.some((m) => g.state(m) === g.preferred) &&
				g.partitionRows.some((m) => m.sourceId !== source && m.variant.isDefault)
			)
				continue;
			throw new Error(
				`Default coverage: unjustified missing source default for ${g.product.id} / ${source} / ${g.partition}`
			);
		}
	}
}

/** Run after final rig assignment, before statistics/publication; never drop a curve. */
export function finaliseDefaults(
	products: ReadonlyMap<string, Product>,
	rows: readonly Row[],
	decisions: readonly Decision[]
) {
	const before = defaultCoverage(rows);
	const changes: {
		productId: string;
		source: string;
		partition: string;
		selected: string;
		demoted: string[];
		reason: string;
	}[] = [];
	const exceptions: { productId: string; source: string; partition: string; preferred: string }[] = [];
	for (const g of groups(products, rows, decisions)) {
		// Resolve multiple defaults only when the already selected labelled state exists here.
		for (const [source, ms] of g.sources) {
			const defaults = ms.filter((m) => m.variant.isDefault);
			const matches = g.preferred ? ms.filter((m) => g.state(m) === g.preferred) : [];
			if (defaults.length < 2 || !matches.length) continue;
			const selected = matches.find((m) => m.variant.isDefault) ?? fallback(g.product, matches);
			selected.variant.isDefault = true;
			const demoted = defaults.filter((m) => m !== selected);
			for (const m of demoted) {
				m.variant.isDefault = false;
				if (m.variant.kind === 'default') m.variant.kind = 'tuning';
			}
			changes.push({
				productId: g.product.id,
				source,
				partition: g.partition,
				selected: selected.id,
				demoted: demoted.map((m) => m.id),
				reason: 'selected labelled switch state'
			});
		}
		for (const [source, ms] of g.sources) {
			if (ms.some((m) => m.variant.isDefault)) continue;
			const matches = g.preferred ? ms.filter((m) => g.state(m) === g.preferred) : [];
			if (
				!singletonFallback(ms) &&
				g.preferred &&
				!matches.length &&
				g.partitionRows.some((m) => m.sourceId !== source && m.variant.isDefault)
			) {
				exceptions.push({ productId: g.product.id, source, partition: g.partition, preferred: g.preferred });
				continue;
			}
			const selected = fallback(g.product, matches.length ? matches : ms);
			selected.variant.isDefault = true;
			const reason = matches.length ? 'selected labelled switch state' : 'deterministic coverage fallback';
			selected.provenance.processing.push(
				`default coverage: ${reason}; original kind ${selected.variant.kind} retained`
			);
			changes.push({
				productId: g.product.id,
				source,
				partition: g.partition,
				selected: selected.id,
				demoted: [],
				reason
			});
		}
	}
	assertDefaultCoverage(products, rows, decisions);
	const unresolvedMultipleDefaults = [
		...Map.groupBy(
			rows.map((r) => r.measurement),
			(m) => `${m.productId}|${m.sourceId}|${m.partition}`
		).values()
	].flatMap((ms) => {
		const defaults = ms.filter((m) => m.variant.isDefault);
		const first = defaults[0];
		return defaults.length > 1 && first
			? [
					{
						productId: first.productId,
						source: first.sourceId,
						partition: first.partition,
						defaults: defaults.map((m) => ({
							measurementId: m.id,
							file: m.variant.file,
							label: m.variant.label
						}))
					}
				]
			: [];
	});
	return { before, after: defaultCoverage(rows), changes, exceptions, unresolvedMultipleDefaults };
}
