<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	let {
		variant = 'primary',
		children,
		...rest
	}: HTMLButtonAttributes & { variant?: 'primary' | 'quiet' | 'icon'; children?: Snippet } = $props();
</script>

<button type="button" {...rest} class={['button', variant, rest.class]}>{@render children?.()}</button>
