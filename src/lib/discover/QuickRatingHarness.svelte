<script lang="ts">
	import ResultRow from './ResultRow.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { profileStore } from '#lib/profile/store.ts';
	import type { WorkspaceItem } from '#lib/profile/profile.ts';
	const store = profileStore({ getItem: () => null, setItem: () => {} });
	let items = $state.raw<WorkspaceItem[]>([]);
	let message = $state('');
</script>

<ol>
	<ResultRow
		candidate={{
			id: 'c',
			product: { id: 'p', brand: 'Fixture', model: 'One', form: 'iem' },
			kind: 'default',
			variantLabel: null,
			measurementIds: [],
			sources: [],
			prices: [],
			priceUsd: null
		}}
		existing={items[0]}
		rank={1}
		distance={1}
		bands={[]}
		onshow={() => {}}
		onrate={(item: WorkspaceItem) => {
			store.change({ ...store.value, profiles: { ...store.value.profiles, iem: [item] } });
			items = store.value.profiles.iem;
			message = 'Rating saved.';
		}}
	/>
</ol>
<p data-testid="workspace-count">{items.length}</p>
<Toast
	{message}
	onundo={() => {
		store.undo();
		items = store.value.profiles.iem;
		message = '';
	}}
	ondismiss={() => {
		message = '';
	}}
/>
