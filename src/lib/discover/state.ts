import type { Focus } from '#core/analysis/weights.ts';
import type { SourceMode, TasteRequest } from '#core/atlas/types.ts';
import { parseProfile, soundItems, type WorkspaceItem } from '#lib/profile/profile.ts';

export interface DiscoveryState {
	rig: string;
	focus: Focus;
	alpha?: number;
	max?: number;
	tunings: boolean;
	sources: string[];
	sourceMode: SourceMode;
	overlays: string[];
	sort: 'mean' | 'minimax';
	pareto: boolean;
	view: 'auto' | 'taste';
	items: WorkspaceItem[] | undefined;
	corrections: NonNullable<TasteRequest['corrections']>;
	issue: string;
}
const ids = (text: string | null) => [...new Set((text ?? '').split(',').filter(Boolean))];

/** Old explicit references become one Like. Saved v1 ratings remain explicit, including Love. */
export function parseDiscovery(params: Pick<URLSearchParams, 'get' | 'has'>): DiscoveryState {
	const focus = params.get('focus');
	const alpha = Number(params.get('alpha'));
	const max = Number(params.get('max'));
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
		if (params.has('edits')) {
			const raw: unknown = JSON.parse(params.get('edits') ?? '[]');
			const bands = ['sub-bass', 'bass', 'low-mid', 'mid', 'presence', 'treble', 'air'];
			if (!Array.isArray(raw) || raw.length > 20) throw new Error('Invalid corrections');
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
		items = [];
		corrections = [];
		issue =
			'This shared workspace contains invalid ratings or corrections. Your saved profile has not changed.';
	}
	return {
		rig: params.get('rig') ?? '',
		focus: (['bass', 'vocals', 'treble'].includes(focus ?? '') ? focus : 'balanced') as Focus,
		...(params.has('alpha') && Number.isFinite(alpha) && alpha >= 1 && alpha <= 4 ? { alpha } : {}),
		...(params.has('max') && Number.isFinite(max) && max >= 0 ? { max } : {}),
		tunings: params.get('tunings') === '1',
		sources: ids(params.get('sources')),
		sourceMode: params.get('sourceMode') === 'only' ? 'only' : 'coverage',
		overlays: ids(params.get('chart')).slice(0, 5),
		sort: params.get('sort') === 'minimax' ? 'minimax' : 'mean',
		pareto: params.get('pareto') === '1',
		view:
			params.get('view') === 'taste' || ['profile', 'taste'].includes(params.get('mode') ?? '')
				? 'taste'
				: 'auto',
		items,
		corrections,
		issue
	};
}

export function discoveryRoute(
	items: readonly WorkspaceItem[],
	view: DiscoveryState['view']
): 'empty' | 'similar' | 'compare' | 'taste' {
	const active = soundItems(items);
	const likes = active.filter((item) => item.rating === 'love' || item.rating === 'like');
	if (!likes.length) return 'empty';
	if (
		view === 'taste' ||
		active.some((item) => item.rating === 'dislike') ||
		items.filter((item) => item.soundRelated && item.rating !== 'unrated').length >= 5
	)
		return 'taste';
	return likes.length === 1 ? 'similar' : 'compare';
}

/** Preserve advanced and unknown share parameters while replacing only workspace evidence. */
export function withItems(
	params: Pick<URLSearchParams, 'toString'>,
	items: readonly WorkspaceItem[]
): URLSearchParams {
	const next = new URLSearchParams(params.toString());
	for (const key of ['mode', 'ref', 'm', 'edits', 'chart']) next.delete(key);
	next.set('ratings', JSON.stringify(items));
	return next;
}
