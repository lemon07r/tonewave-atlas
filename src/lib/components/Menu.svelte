<script lang="ts">
	import Icon from './Icon.svelte';
	let {
		label,
		items
	}: { label: string; items: readonly { label: string; action: () => void; disabled?: boolean }[] } =
		$props();
	const id = $props.id();
	let popup: HTMLDivElement;
	function keydown(event: KeyboardEvent) {
		const buttons = [...popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
		const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
		let next: number;
		if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
		else if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
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
				popup.showPopover();
				const buttons = popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
				buttons[event.key === 'ArrowUp' ? buttons.length - 1 : 0]?.focus();
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
			if (event.newState === 'open') popup.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
		}}
	>
		{#each items as item (item.label)}<button
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
