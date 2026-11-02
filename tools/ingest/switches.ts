import type { Measurement, Product } from '#core/dataset/types.ts';
import { classifyEq } from './eq.ts';
import { collisionGroups, normalise, withoutAttribution } from './transform.ts';
import {
	adapterState,
	cableDescriptor,
	cableSuffixes,
	stateSuffix,
	switchState,
	tipDescriptor,
	tipSuffixes,
	tuningDescriptor
} from './variant-labels.ts';

interface SwitchRow {
	measurement: Measurement;
}

const ambiguousTipPrefix = 'ambiguous tip suffix kept as non-default tuning: ';
const ambiguousTip = (m: Measurement) =>
	m.provenance.processing.some((p) => p.startsWith(ambiguousTipPrefix));

/** Neutral cable metadata cannot erase existing fit, unit, EQ or impedance-load meaning. */
function cableKind(m: Measurement): Measurement['variant']['kind'] {
	if (m.variant.kind === 'unit') return 'unit';
	if (m.variant.kind === 'tuning' || tuningDescriptor(m.variant.label) || /\bdsp\b/i.test(m.variant.label))
		return 'tuning';
	return m.variant.kind === 'fit' ? 'fit' : 'setup';
}

/** Fold only recognized terminal state descriptors into an already accepted exact parent. */
export function mergeSwitchIdentities(products: Map<string, Product>, rows: readonly SwitchRow[]) {
	const before = collisionGroups([...products.values()]);
	const key = (p: Product, model = p.model) => `${p.form}:${normalise(p.brand)}:${normalise(model)}`;
	const parents = new Map([...products.values()].map((p) => [key(p), p]));
	const cableMeasurements = new Set<string>();
	const tipMeasurements = new Set<string>();
	const moves: {
		from: string;
		to: string;
		form: string;
		kind: 'switch' | 'cable' | 'tip';
		before: string;
		parent: string;
		label: string;
		measurements: number;
		ambiguousTokens?: string[];
	}[] = [];
	const unresolved: { product: string; label: string; reason: string }[] = [];
	for (const p of [...products.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
		const switchSuffix = stateSuffix(p.model);
		const cableSuffix =
			cableSuffixes(p.model).find((s) => parents.has(key(p, s.parent))) ?? cableSuffixes(p.model)[0];
		const tipSuffix =
			tipSuffixes(p.model).find((s) => parents.has(key(p, s.parent))) ?? tipSuffixes(p.model)[0];
		const suffix = switchSuffix ?? cableSuffix ?? tipSuffix;
		if (!suffix) continue;
		const kind = switchSuffix ? 'switch' : cableSuffix ? 'cable' : 'tip';
		const parent = parents.get(key(p, suffix.parent));
		if (!parent || !products.has(parent.id) || stateSuffix(parent.model)) {
			unresolved.push({
				product: `${p.brand} ${p.model}`,
				label: suffix.label,
				reason: 'no accepted unsuffixed exact parent'
			});
			continue;
		}
		for (const { measurement: m } of rows.filter((r) => r.measurement.productId === p.id)) {
			if (kind === 'cable') cableMeasurements.add(m.id);
			if (kind === 'tip') tipMeasurements.add(m.id);
			m.productId = parent.id;
			m.variant.label = [m.variant.label, suffix.label].filter(Boolean).join(' · ');
			m.provenance.processing.push(
				`recognized ${kind === 'switch' ? 'switch-state' : kind === 'tip' ? 'tip/fit' : 'cable/termination'} identity: ${p.brand} ${p.model} -> ${parent.brand} ${parent.model}; ${suffix.label}`
			);
			if (kind === 'cable') {
				if (/\bdsp\b/i.test(suffix.label) || tuningDescriptor(suffix.label)) m.variant.isDefault = false;
				if (!m.variant.isDefault) m.variant.kind = cableKind(m);
			}
			if (kind === 'tip') {
				if (tipSuffix?.unknown?.length) {
					m.provenance.processing.push(
						`${ambiguousTipPrefix}${suffix.label}; unrecognized tokens: ${tipSuffix.unknown.join(', ')}`
					);
					m.variant.isDefault = false;
					if (m.variant.kind !== 'unit') m.variant.kind = 'tuning';
				} else if (!m.variant.isDefault && m.variant.kind !== 'unit' && m.variant.kind !== 'tuning')
					m.variant.kind = 'fit';
			}
			parent.measurementIds.push(m.id);
		}
		products.delete(p.id);
		moves.push({
			from: p.id,
			to: parent.id,
			form: p.form,
			kind,
			before: `${p.brand} ${p.model}`,
			parent: `${parent.brand} ${parent.model}`,
			label: suffix.label,
			measurements: p.measurementIds.length,
			...(kind === 'tip' && tipSuffix?.unknown?.length ? { ambiguousTokens: tipSuffix.unknown } : {})
		});
	}
	const cableDefaultChanges: { source: string; productId: string; selected: string; demoted: string[] }[] =
		[];
	const tipDefaultChanges: typeof cableDefaultChanges = [];
	for (const [productId, group] of Map.groupBy(rows, (r) => r.measurement.productId)) {
		if (!moves.some((m) => m.to === productId && m.kind !== 'switch')) continue;
		for (const [source, sourceRows] of Map.groupBy(group, (r) => r.measurement.sourceId)) {
			const cable = sourceRows.some((r) => cableMeasurements.has(r.measurement.id));
			const tip = sourceRows.some((r) => tipMeasurements.has(r.measurement.id));
			if (!cable && !tip) continue;
			const sole = sourceRows.length === 1 ? sourceRows[0]?.measurement : undefined;
			if (tip && sole && !sole.variant.isDefault && !['unit', 'tuning'].includes(cableKind(sole))) {
				sole.variant.isDefault = true;
				sole.variant.kind = 'default';
				tipDefaultChanges.push({ source, productId, selected: sole.id, demoted: [] });
			}
			const defaults = sourceRows.map((r) => r.measurement).filter((m) => m.variant.isDefault);
			if (defaults.length < 2) continue;
			const selected =
				defaults.find((m) => /\b(?:stock|standard|default)\b/i.test(m.variant.label)) ?? defaults[0];
			if (!selected) continue;
			const demoted = defaults.filter((m) => m !== selected);
			for (const m of demoted) {
				m.variant.isDefault = false;
				const existing = cableKind(m);
				m.variant.kind =
					(tipMeasurements.has(m.id) || (tip && !cable)) && !['unit', 'tuning'].includes(existing)
						? 'fit'
						: existing;
			}
			(cable ? cableDefaultChanges : tipDefaultChanges).push({
				source,
				productId,
				selected: selected.id,
				demoted: demoted.map((m) => m.id)
			});
		}
	}
	// Compare connected-group membership, not the difference between two unstable near-name counts.
	const moveByName = new Map(moves.map((m) => [`[${m.form}] ${m.before}`, `[${m.form}] ${m.parent}`]));
	const changedGroups = before.flatMap((group) => {
		const names = group;
		if (!names.some((n) => moveByName.has(n))) return [];
		return [
			{
				before: group,
				after: [...new Set(names.map((n) => moveByName.get(n) ?? n))],
				resolved: new Set(names.map((n) => moveByName.get(n) ?? n)).size === 1
			}
		];
	});
	return {
		moves,
		cableDefaultChanges,
		tipDefaultChanges,
		tipAmbiguities: rows
			.filter((r) => ambiguousTip(r.measurement))
			.map(({ measurement: m }) => ({
				measurementId: m.id,
				productId: m.productId,
				source: m.sourceId,
				file: m.variant.file,
				label: m.variant.label
			})),
		unresolved,
		groupsBefore: before.length,
		groupsAfter: collisionGroups([...products.values()]).length,
		resolvedGroups: changedGroups.filter((g) => g.resolved).length,
		partiallyResolvedGroups: changedGroups.filter((g) => !g.resolved).length,
		changedGroups
	};
}

/** Reproducible, source-attributed review of every product with labelled state/cable options. */
export function reviewVariantStates(products: ReadonlyMap<string, Product>, rows: readonly SwitchRow[]) {
	return [...Map.groupBy(rows, (r) => r.measurement.productId)].flatMap(([id, group]) => {
		const product = products.get(id);
		if (
			!product ||
			!group.some(
				({ measurement: m }) =>
					tuningDescriptor(`${m.variant.file} ${m.variant.label}`) ||
					cableDescriptor(`${m.variant.file} ${m.variant.label}`) ||
					tipDescriptor(`${m.variant.file} ${m.variant.label}`)
			)
		)
			return [];
		return [
			{
				productId: id,
				product: `${product.brand} ${product.model}`,
				sources: [...Map.groupBy(group, (r) => r.measurement.sourceId)].map(([source, rs]) => ({
					source,
					variants: rs.map(({ measurement: m }) => ({
						measurementId: m.id,
						partition: m.partition,
						...m.variant
					}))
				}))
			}
		];
	});
}

/** Shared by reconciliation and final partition coverage: never translate between encodings. */
export function labelledState(
	product: Product,
	measurements: readonly Measurement[]
): (m: Measurement) => string | null {
	const withoutModel = (text: string) =>
		withoutAttribution(text).replaceAll(
			new RegExp(product.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
			' '
		);
	const explicitState = (m: Measurement) =>
		switchState(withoutModel(m.variant.label)) ?? switchState(withoutModel(m.variant.file));
	const impedanceContext = measurements.some((m) => explicitState(m)?.startsWith('impedance:'));
	return (m) => {
		const text = withoutModel(`${m.variant.file} ${m.variant.label}`);
		const short = impedanceContext ? text.match(/\b(high|low)(?=\b|\+)|\(([lh])\)/i) : null;
		const primary =
			explicitState(m) ??
			(short ? `impedance:${/^(?:low|l)$/i.test(short[1] ?? short[2] ?? '') ? 'low' : 'high'}` : null);
		const adapter = adapterState(text);
		return primary ? `${primary}${adapter ? `+${adapter}` : ''}` : adapter;
	};
}

/** Align labelled switch states by one vote per source; ties/unknown encodings are never guessed. */
export function reconcileSwitchDefaults(products: ReadonlyMap<string, Product>, rows: readonly SwitchRow[]) {
	const decisions: {
		productId: string;
		product: string;
		partition: string;
		votes: Record<string, number>;
		preferred: string | null;
		reason: string;
		changedSources: string[];
		changes: { source: string; before: string[]; after: string | null }[];
		unresolvedSources: string[];
		labelledStates: string[];
	}[] = [];
	for (const group of Map.groupBy(rows, (r) => r.measurement.productId).values()) {
		const first = group[0]?.measurement;
		const product = first && products.get(first.productId);
		if (!first || !product) continue;
		const descriptor = (m: Measurement) =>
			`${m.variant.file} ${m.variant.label}`.replaceAll(
				new RegExp(product.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
				' '
			);
		const state = labelledState(
			product,
			group.map((r) => r.measurement)
		);
		const labelledStates = [
			...new Set(group.map((r) => state(r.measurement)).filter((s): s is string => s !== null))
		].sort();
		if (labelledStates.length < 2 || !labelledStates.some((s) => !s.startsWith('adapter:'))) continue;
		const bySource = Map.groupBy(
			group.map((r) => r.measurement),
			(m) => m.sourceId
		);
		const votes: Record<string, number> = {};
		for (const ms of bySource.values()) {
			const states = [
				...new Set(
					ms
						.filter((m) => m.variant.isDefault)
						.map(state)
						.filter((s): s is string => s !== null && !s.includes('adapter:'))
				)
			];
			if (states.length === 1) {
				const s = states[0];
				if (s) votes[s] = (votes[s] ?? 0) + 1;
			}
		}
		const ranked = Object.entries(votes).sort(([a, n], [b, m]) => m - n || a.localeCompare(b, 'en'));
		const preferred = ranked[0] && ranked[0][1] > (ranked[1]?.[1] ?? 0) ? ranked[0][0] : null;
		const changes: { source: string; before: string[]; after: string | null }[] = [];
		const unresolvedSources: string[] = [];
		if (preferred)
			for (const [source, ms] of bySource) {
				const before = ms
					.filter((m) => m.variant.isDefault)
					.map((m) => m.id)
					.sort();
				const eligible = ms.filter(
					(m) =>
						state(m) === preferred &&
						m.variant.kind !== 'unit' &&
						!ambiguousTip(m) &&
						classifyEq(`${m.variant.file} ${m.variant.label}`) !== 'ambiguous'
				);
				const selected = eligible.find((m) => m.variant.isDefault) ?? eligible[0];
				const explicit = ms.filter((m) => state(m) !== null);
				if (!selected && explicit.length) unresolvedSources.push(source);
				// Unresolved multiple defaults must survive unchanged unless the selected state is present.
				if (!selected && before.length > 1) continue;
				if (!explicit.length) continue;
				for (const m of explicit)
					if (m.variant.kind !== 'unit') {
						m.variant.isDefault = m === selected;
						m.variant.kind =
							m === selected
								? 'default'
								: state(m) === preferred &&
									  !ambiguousTip(m) &&
									  classifyEq(`${m.variant.file} ${m.variant.label}`) !== 'ambiguous' &&
									  tipDescriptor(descriptor(m))
									? 'fit'
									: 'tuning';
					}
				// An explicit canonical state replaces the source's unlabelled fallback, never a second default.
				if (selected)
					for (const m of ms)
						if (m !== selected && m.variant.isDefault) {
							m.variant.isDefault = false;
							m.variant.kind =
								state(m) === null &&
								tipDescriptor(descriptor(m)) &&
								classifyEq(`${m.variant.file} ${m.variant.label}`) !== 'ambiguous'
									? 'fit'
									: 'tuning';
						}
				const after = ms
					.filter((m) => m.variant.isDefault)
					.map((m) => m.id)
					.sort();
				if (JSON.stringify(before) !== JSON.stringify(after))
					changes.push({ source, before, after: selected?.id ?? after[0] ?? null });
			}
		decisions.push({
			productId: first.productId,
			product: `${product.brand} ${product.model}`,
			partition: 'all source partitions (labels only)',
			votes,
			preferred,
			reason: preferred
				? 'unique plurality of explicitly labelled source defaults; no acoustic or encoding equivalence assumed'
				: 'no unique labelled-source default plurality',
			changedSources: changes.map((c) => c.source),
			changes,
			unresolvedSources,
			labelledStates
		});
	}
	return {
		products: new Set(decisions.filter((d) => d.changes.length).map((d) => d.productId)).size,
		sources: new Set(decisions.flatMap((d) => d.changedSources)).size,
		productSources: decisions.reduce((n, d) => n + d.changedSources.length, 0),
		decisions
	};
}
