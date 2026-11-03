export type RankChange = 'new' | number;
interface Changes {
	markers: ReadonlyMap<string, RankChange>;
	summary: string;
}

/** Track accepted responses, not URL/view changes. The first occurrence represents a product. */
export function rankChanges() {
	let previous: Map<string, number> | undefined;
	let workspace = '';
	let changes: Changes = { markers: new Map(), summary: '' };
	return (key: string, productIds: readonly string[]): Changes => {
		const ranks = new Map<string, number>();
		productIds.forEach((id, index) => {
			if (!ranks.has(id)) ranks.set(id, index + 1);
		});
		if (key !== workspace) {
			const markers = new Map<string, RankChange>();
			let added = 0,
				moved = 0;
			if (previous?.size && ranks.size) {
				for (const [id, rank] of ranks) {
					const before = previous.get(id);
					if (before === undefined) {
						markers.set(id, 'new');
						added++;
					} else if (before !== rank) {
						markers.set(id, before - rank);
						moved++;
					}
				}
			}
			changes = {
				markers,
				summary: previous?.size && ranks.size ? `${added} new matches, ${moved} moved` : ''
			};
			workspace = key;
		}
		// Sort/filter runs become the baseline for the next preference edit, but never create markers.
		previous = ranks;
		return changes;
	};
}
