import type { Focus } from '#core/analysis/weights.ts';
import type { SourceMode, TasteRequest } from '#core/atlas/types.ts';
import { parseProfile, PROFILE_LIMIT, soundItems, type WorkspaceItem } from '#lib/profile/profile.ts';

export interface DiscoveryState {
	rig: string;
	focus: Focus;
	alpha?: number;
	max?: number;
	tunings: boolean;
	modified: boolean;
	minReviewers: number;
	sources: string[];
	sourceMode: SourceMode;
	overlays: string[];
	sort: 'mean' | 'minimax';
	pareto: boolean;
	view: 'auto' | 'taste';
	depth: number;
	items: WorkspaceItem[] | undefined;
	corrections: NonNullable<TasteRequest['corrections']>;
	issue: string;
}
const ids = (text: string | null) => [...new Set((text ?? '').split(',').filter(Boolean))];
export const FORM_SCOPED_DISCOVERY_KEYS = [
	'ratings',
	'ref',
	'refs',
	'm',
	'rig',
	'sources',
	'sourceMode',
	'edits',
	'chart',
	'mode',
	'depth'
] as const;

/** Keep shared evidence in the URL, separately from each form's saved profile. */
export function withForm(url: URL, form: 'iem' | 'headphone'): URL {
	const next = new URL(url.href);
	const outgoing = url.searchParams.get('form') === 'headphones' ? 'headphone' : 'iem';
	if (outgoing === form) return next;
	const items = parseDiscovery(next.searchParams).items;
	if (items) next.searchParams.set(`ratings-${outgoing}`, JSON.stringify(items));
	for (const key of [...FORM_SCOPED_DISCOVERY_KEYS, 'p', 'diff', 'product', 'measurement'])
		next.searchParams.delete(key);
	const incoming = next.searchParams.get(`ratings-${form}`);
	if (incoming !== null) next.searchParams.set('ratings', incoming);
	if (form === 'iem') next.searchParams.delete('form');
	else next.searchParams.set('form', 'headphones');
	return next;
}

/** Old explicit references become one Like. Saved v1 ratings remain explicit, including Love. */
export function parseDiscovery(params: Pick<URLSearchParams, 'get' | 'has'>): DiscoveryState {
	const focus = params.get('focus');
	const alpha = Number(params.get('alpha'));
	const max = Number(params.get('max'));
	const depth = Number(params.get('depth'));
	let items: WorkspaceItem[] | undefined;
	let issue = '';
	let corrections: DiscoveryState['corrections'] = [];
	try {
		if (params.has('ratings')) {
			const raw: unknown = JSON.parse(params.get('ratings') ?? '[]');
			items = parseProfile(JSON.stringify({ version: 2, profiles: { iem: raw, headphone: [] } })).profiles
				.iem;
		} else if (params.get('ref') && !['profile', 'taste'].includes(params.get('mode') ?? '')) {
			items = [
				{
					productId: params.get('ref') ?? '',
					rating: 'like',
					strength: 0.6,
					soundRelated: true,
					...(params.get('m') ? { measurementId: params.get('m') ?? '' } : {})
				}
			];
		}
	} catch {
		items = [];
		issue = 'This shared workspace contains invalid ratings. Your saved profile has not changed.';
	}
	try {
		if (params.has('edits')) {
			const raw: unknown = JSON.parse(params.get('edits') ?? '[]');
			const bands = ['sub-bass', 'bass', 'low-mid', 'mid', 'presence', 'treble', 'air'];
			if (!Array.isArray(raw) || raw.length > PROFILE_LIMIT) throw new Error('Invalid corrections');
			for (const edit of raw as unknown[]) {
				if (
					!edit ||
					typeof edit !== 'object' ||
					!('tasteId' in edit) ||
					!('bands' in edit) ||
					!Number.isInteger(edit.tasteId) ||
					Number(edit.tasteId) < 0 ||
					!edit.bands ||
					typeof edit.bands !== 'object' ||
					!Object.entries(edit.bands).every(
						([key, n]) =>
							bands.includes(key) && typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 4
					)
				)
					throw new Error('Invalid corrections');
				corrections.push({ tasteId: Number(edit.tasteId), bands: { ...edit.bands } });
			}
		}
	} catch {
		corrections = [];
		issue = issue || 'This shared workspace contains invalid corrections. Your ratings have been kept.';
	}
	return {
		rig: params.get('rig') ?? '',
		focus: (['bass', 'vocals', 'treble'].includes(focus ?? '') ? focus : 'balanced') as Focus,
		...(params.has('alpha') && Number.isFinite(alpha) && alpha >= 1 && alpha <= 4 ? { alpha } : {}),
		...(params.has('max') && Number.isFinite(max) && max >= 0 ? { max } : {}),
		tunings: params.get('tunings') === '1',
		modified: params.get('modified') === '1',
		minReviewers: [2, 3, 5].includes(Number(params.get('minReviewers')))
			? Number(params.get('minReviewers'))
			: 1,
		sources: ids(params.get('sources')),
		sourceMode:
			params.get('sourceMode') === 'only' && ids(params.get('sources')).length ? 'only' : 'coverage',
		overlays: ids(params.get('chart')).slice(0, 5),
		sort: params.get('sort') === 'minimax' ? 'minimax' : 'mean',
		pareto: params.get('pareto') === '1',
		depth: Number.isSafeInteger(depth) && depth >= 20 ? depth : 20,
		view:
			params.get('view') === 'taste' || ['profile', 'taste'].includes(params.get('mode') ?? '')
				? 'taste'
				: 'auto',
		items,
		corrections,
		issue
	};
}

/** Apply one atomic URL update, keeping source-only pooling and taste corrections model-scoped. */
export function withDiscoveryChanges(
	params: Pick<URLSearchParams, 'toString'>,
	changes: Record<string, string | undefined>
): URLSearchParams {
	const next = new URLSearchParams(params.toString());
	const modelChanged = ['rig', 'sources', 'sourceMode'].some(
		(key) => key in changes && (next.get(key) ?? '') !== (changes[key] ?? '')
	);
	for (const [key, value] of Object.entries(changes)) {
		if (value) next.set(key, value);
		else next.delete(key);
	}
	if (!ids(next.get('sources')).length) next.delete('sourceMode');
	if (next.get('modified') !== '1') next.delete('modified');
	if (![2, 3, 5].includes(Number(next.get('minReviewers')))) next.delete('minReviewers');
	if (modelChanged) next.delete('edits');
	return next;
}

export function discoveryRoute(
	items: readonly WorkspaceItem[],
	view: DiscoveryState['view']
): 'empty' | 'similar' | 'compare' | 'taste' {
	const active = soundItems(items);
	const likes = active.filter((item) => item.rating === 'love' || item.rating === 'like');
	if (!likes.length) return 'empty';
	if (view === 'taste' || active.some((item) => item.rating === 'dislike') || active.length >= 5)
		return 'taste';
	return likes.length === 1 ? 'similar' : 'compare';
}

/** Preserve advanced and unknown share parameters while replacing only workspace evidence. */
export function withItems(
	params: Pick<URLSearchParams, 'toString'>,
	items: readonly WorkspaceItem[]
): URLSearchParams {
	const next = new URLSearchParams(params.toString());
	if (['profile', 'taste'].includes(next.get('mode') ?? '')) next.set('view', 'taste');
	for (const key of ['mode', 'ref', 'm', 'edits', 'chart', 'depth']) next.delete(key);
	next.set('ratings', JSON.stringify(items));
	return next;
}
