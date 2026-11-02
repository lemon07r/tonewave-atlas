import type { Analysis } from '#core/atlas/service.ts';
import type { AtlasError, CompareResult, SimilarResult, TasteResult } from '#core/atlas/types.ts';
import { soundItems, type WorkspaceItem } from '#lib/profile/profile.ts';
import { discoveryRoute, type DiscoveryState } from './state.ts';

export type DiscoveryResult =
	| { kind: 'similar'; data: SimilarResult }
	| { kind: 'compare'; data: CompareResult }
	| { kind: 'taste'; data: TasteResult };
export interface QuerySpec {
	state: DiscoveryState;
	items: WorkspaceItem[];
	topK: number;
	uploadId?: string;
}

export async function queryDiscovery(
	service: Pick<Analysis, 'similar' | 'compare' | 'taste'>,
	spec: QuerySpec
): Promise<DiscoveryResult | AtlasError | null> {
	const { state, items, topK, uploadId } = spec;
	const route = uploadId ? 'similar' : discoveryRoute(items, state.view);
	const active = soundItems(items);
	const likes = active.filter((item) => item.rating === 'love' || item.rating === 'like');
	const settings = {
		...(state.rig ? { partition: state.rig } : {}),
		focus: state.focus,
		...(state.alpha === undefined ? {} : { treblePenalty: state.alpha }),
		topK,
		filters: {
			includeTunings: state.tunings,
			...(state.max === undefined ? {} : { maxPriceUsd: state.max }),
			...(state.sources.length ? { sources: state.sources } : {})
		}
	};
	if (route === 'similar') {
		const reference = likes[0];
		if (!uploadId && !reference) return null;
		const data = await service.similar({
			...settings,
			...(uploadId
				? { uploadId }
				: {
						productId: reference?.productId ?? '',
						...(reference?.measurementId ? { measurementId: reference.measurementId } : {})
					})
		});
		return data.ok ? { kind: 'similar', data } : data;
	}
	if (route === 'compare') {
		const data = await service.compare({
			...settings,
			references: likes.map(({ productId, measurementId }) => ({
				productId,
				...(measurementId ? { measurementId } : {})
			})),
			sort: state.sort,
			paretoOnly: state.pareto
		});
		return data.ok ? { kind: 'compare', data } : data;
	}
	if (route === 'taste') {
		const data = await service.taste({
			items: active,
			...(state.rig ? { partition: state.rig } : {}),
			filters: settings.filters,
			corrections: state.corrections,
			topK
		});
		return data.ok ? { kind: 'taste', data } : data;
	}
	return null;
}

/** A generation is invalidated immediately on settings changes, including during debounce. */
export function latestQuery<T>() {
	let generation = 0;
	return {
		invalidate() {
			generation++;
		},
		async run(task: () => Promise<T>, receive: (value: T) => void, reject: (cause: unknown) => void) {
			const current = ++generation;
			try {
				const value = await task();
				if (current === generation) receive(value);
			} catch (cause) {
				if (current === generation) reject(cause);
			}
		}
	};
}
