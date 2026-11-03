import { expect, test, vi } from 'vitest';
import type { Analysis } from '#core/atlas/service.ts';
import type { AtlasError } from '#core/atlas/types.ts';
import { queryDiscovery } from './query.ts';
import { parseDiscovery } from './state.ts';
import type { WorkspaceItem } from '#lib/profile/profile.ts';

test('every ranking route passes modified products and minimum contributing reviewers to scoring', async () => {
	const failure: AtlasError = { ok: false, error: 'insufficient-data', message: 'fixture' };
	const service = {
		similar: vi.fn<Analysis['similar']>().mockResolvedValue(failure),
		compare: vi.fn<Analysis['compare']>().mockResolvedValue(failure),
		taste: vi.fn<Analysis['taste']>().mockResolvedValue(failure)
	};
	const like: WorkspaceItem = { productId: 'a', rating: 'like', strength: 0.6, soundRelated: true };
	const state = parseDiscovery(new URLSearchParams('modified=1&minReviewers=3'));
	for (const [route, items] of [
		['similar', [like]],
		['compare', [like, { ...like, productId: 'b' }]],
		['taste', [like, { ...like, productId: 'b', rating: 'dislike' }]]
	] as const) {
		await queryDiscovery(service, { state, items: [...items], topK: 20 });
		expect(service[route].mock.calls[0]?.[0].filters).toEqual({
			includeTunings: false,
			includeModified: true,
			minReviewers: 3,
			sourceMode: 'coverage'
		});
	}
});
