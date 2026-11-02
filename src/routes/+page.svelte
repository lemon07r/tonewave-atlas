<script lang="ts">
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { formFromUrl } from '#lib/atlas.ts';
	import Discover from '#lib/discover/Discover.svelte';
	let form = $derived(browser ? formFromUrl(new URL(page.url.href)) : 'iem');
</script>

<svelte:head
	><title>Discover — Tonewave Atlas</title><meta
		name="description"
		content="Find measured response matches to familiar IEMs and headphones, or build a private taste profile from your own ratings."
	/></svelte:head
>
{#key form}<Discover {form} />{/key}
