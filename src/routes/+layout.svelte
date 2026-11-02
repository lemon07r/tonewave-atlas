<script lang="ts">
	import type { Snippet } from 'svelte';
	import '@fontsource-variable/newsreader';
	import '#lib/styles/app.css';
	import '#lib/styles/prototype.css';
	import '#lib/styles/direction.css';
	import AppShell from '#lib/components/AppShell.svelte';
	let { children }: { children: Snippet } = $props();
</script>

<AppShell>{@render children()}</AppShell>
