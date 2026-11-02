import type { Measurement, Product } from '#core/dataset/types.ts';
import { classifyEq } from './eq.ts';
import { collisionGroups, normalise } from './transform.ts';
import {
	adapterState,
	cableDescriptor,
	cableSuffixes,
	stateSuffix,
	switchState,
	tipDescriptor,
	tuningDescriptor
} from './variant-labels.ts';

interface SwitchRow {
	measurement: Measurement;
}

/** Fold only recognized terminal state descriptors into an already accepted exact parent. */
export function mergeSwitchIdentities(products: Map<string, Product>, rows: readonly SwitchRow[]) {
	const before = collisionGroups([...products.values()]);
	const key = (p: Product, model = p.model) => `${p.form}:${normalise(p.brand)}:${normalise(model)}`;
	const parents = new Map([...products.values()].map((p) => [key(p), p]));
	const cableMeasurements = new Set<string>();
	const moves: {
		from: string;
		to: string;
		form: string;
		kind: 'switch' | 'cable';
		before: string;
		parent: string;
		label: string;
		measurements: number;
	}[] = [];
	const unresolved: { product: string; label: string; reason: string }[] = [];
	for (const p of [...products.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
		const switchSuffix = stateSuffix(p.model);
		const suffix =
			switchSuffix ??
			cableSuffixes(p.model).find((s) => parents.has(key(p, s.parent))) ??
			cableSuffixes(p.model)[0];
		if (!suffix) continue;
		const parent = parents.get(key(p, suffix.parent));
		if (!parent || stateSuffix(parent.model)) {
			unresolved.push({
				product: `${p.brand} ${p.model}`,
				label: suffix.label,
				reason: 'no accepted unsuffixed exact parent'
			});
			continue;
		}
		for (const { measurement: m } of rows.filter((r) => r.measurement.productId === p.id)) {
			if (!switchSuffix) cableMeasurements.add(m.id);
			m.productId = parent.id;
			m.variant.label = [m.variant.label, suffix.label].filter(Boolean).join(' · ');
			m.provenance.processing.push(
				`recognized ${switchSuffix ? 'switch-state' : 'cable/termination'} identity: ${p.brand} ${p.model} -> ${parent.brand} ${parent.model}; ${suffix.label}`
			);
			if (!switchSuffix && !m.variant.isDefault && m.variant.kind !== 'unit')
				m.variant.kind = /\bdsp\b/i.test(suffix.label) || tuningDescriptor(suffix.label) ? 'tuning' : 'setup';
			parent.measurementIds.push(m.id);
		}
		products.delete(p.id);
		moves.push({
			from: p.id,
			to: parent.id,
			form: p.form,
			kind: switchSuffix ? 'switch' : 'cable',
			before: `${p.brand} ${p.model}`,
			parent: `${parent.brand} ${parent.model}`,
			label: suffix.label,
			measurements: p.measurementIds.length
		});
	}
	const cableDefaultChanges: { source: string; productId: string; selected: string; demoted: string[] }[] =
		[];
	for (const [productId, group] of Map.groupBy(rows, (r) => r.measurement.productId)) {
		if (!moves.some((m) => m.to === productId && m.kind === 'cable')) continue;
		for (const [source, sourceRows] of Map.groupBy(group, (r) => r.measurement.sourceId)) {
			if (!sourceRows.some((r) => cableMeasurements.has(r.measurement.id))) continue;
			const defaults = sourceRows.map((r) => r.measurement).filter((m) => m.variant.isDefault);
			if (defaults.length < 2) continue;
			const selected =
				defaults.find((m) => /\b(?:stock|standard|default)\b/i.test(m.variant.label)) ?? defaults[0];
			if (!selected) continue;
			const demoted = defaults.filter((m) => m !== selected);
			for (const m of demoted) {
				m.variant.isDefault = false;
				m.variant.kind = 'setup';
			}
			cableDefaultChanges.push({
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
					cableDescriptor(`${m.variant.file} ${m.variant.label}`)
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
		const withoutModel = (text: string) =>
			text.replaceAll(new RegExp(product.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
		const descriptor = (m: Measurement) => withoutModel(`${m.variant.file} ${m.variant.label}`);
		const explicitState = (m: Measurement) =>
			switchState(withoutModel(m.variant.label)) ?? switchState(withoutModel(m.variant.file));
		const impedanceContext = group.some((r) => explicitState(r.measurement)?.startsWith('impedance:'));
		const state = (m: Measurement): string | null => {
			const text = descriptor(m);
			const primary =
				explicitState(m) ??
				(impedanceContext
					? (() => {
							const short = text.match(/\b(high|low)(?=\b|\+)|\(([lh])\)/i);
							return short
								? `impedance:${/^(?:low|l)$/i.test(short[1] ?? short[2] ?? '') ? 'low' : 'high'}`
								: null;
						})()
					: null);
			const adapter = adapterState(text);
			return primary ? `${primary}${adapter ? `+${adapter}` : ''}` : adapter;
		};
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
						classifyEq(`${m.variant.file} ${m.variant.label}`) !== 'ambiguous'
				);
				const selected = eligible.find((m) => m.variant.isDefault) ?? eligible[0];
				const explicit = ms.filter((m) => state(m) !== null);
				if (!selected && explicit.length) unresolvedSources.push(source);
				if (!explicit.length) continue;
				for (const m of explicit)
					if (m.variant.kind !== 'unit') {
						m.variant.isDefault = m === selected;
						m.variant.kind =
							m === selected
								? 'default'
								: state(m) === preferred &&
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
							m.variant.kind = 'tuning';
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
