<script lang="ts">
	import Icon from './Icon.svelte';
	let {
		label,
		items
	}: { label: string; items: readonly { label: string; action: () => void; disabled?: boolean }[] } =
		$props();
	const id = $props.id();
	// Per-occurrence identity allows repeated labels and repeated caller objects.
	let actions = $derived(items.map((item) => ({ ...item })));
	let popup: HTMLDivElement;
	let openOnLast = false;
	function keydown(event: KeyboardEvent) {
		const buttons = [...popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
		const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
		let next: number;
		if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
		else if (event.key === 'ArrowUp') next = current <= 0 ? buttons.length - 1 : current - 1;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = buttons.length - 1;
		else return;
		event.preventDefault();
		buttons[next]?.focus();
	}
</script>

<span class="menu-wrap"
	><button
		type="button"
		class="button quiet"
		popovertarget={id}
		aria-haspopup="menu"
		onkeydown={(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				openOnLast = event.key === 'ArrowUp';
				popup.showPopover();
			}
		}}>{label}<Icon name="chevron" size={16} /></button
	>
	<div
		{id}
		bind:this={popup}
		popover="auto"
		role="menu"
		aria-label={label}
		onkeydown={keydown}
		tabindex="-1"
		ontoggle={(event) => {
			if (event.newState === 'open') {
				const buttons = popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
				buttons[openOnLast ? buttons.length - 1 : 0]?.focus();
			}
			openOnLast = false;
		}}
	>
		{#each actions as item (item)}<button
				type="button"
				role="menuitem"
				tabindex="-1"
				disabled={item.disabled}
				onclick={() => {
					popup.hidePopover();
					item.action();
				}}>{item.label}</button
			>{/each}
	</div></span
>

<style>
	[popover] {
		position: fixed;
		inset: auto;
		margin: 8px 20px;
		min-width: 180px;
		padding: 4px;
		background: var(--surface);
		color: var(--ink);
		border: var(--hairline) solid var(--strong-line);
		border-radius: var(--radius);
	}
	[role='menuitem'] {
		display: block;
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		min-height: 44px;
		border: 0;
		border-radius: 2px;
		background: none;
		font-size: var(--text-sm);
	}
	[role='menuitem']:hover,
	[role='menuitem']:focus-visible {
		background: var(--subtle);
	}
</style>
