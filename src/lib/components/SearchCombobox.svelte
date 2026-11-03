<script lang="ts" generics="Item extends SearchItem">
	import type { SearchItem } from '#lib/search.ts';
	import Icon from './Icon.svelte';
	let {
		items,
		label = 'Search products',
		placeholder = 'Brand or model…',
		query = $bindable(''),
		loading = false,
		filter = true,
		shortcut = false,
		emptyText = 'No matching products. Try another name.',
		onquery,
		onselect
	}: {
		items: readonly Item[];
		label?: string;
		placeholder?: string;
		query?: string;
		loading?: boolean;
		filter?: boolean;
		shortcut?: boolean;
		emptyText?: string;
		onquery?: (query: string) => void;
		onselect: (item: Item) => void;
	} = $props();
	const id = $props.id();
	let input: HTMLInputElement;
	let open = $state(false);
	let activeId = $state<string | null>(null);
	let filtered = $derived(
		filter
			? items.filter((item) => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
			: items
	);
	let groups = $derived(
		[...new Set(filtered.map((item) => item.group ?? 'Products'))].map((name) => ({
			name,
			items: filtered.filter((item) => (item.group ?? 'Products') === name)
		}))
	);
	let ordered = $derived(groups.flatMap((group) => group.items));
	let active = $derived(ordered.findIndex((item) => item.id === activeId));
	let expanded = $derived(open);
	function choose(item: Item) {
		query = item.label;
		onquery?.(query);
		open = false;
		activeId = null;
		onselect(item);
		input.focus();
	}
	function move(index: number) {
		activeId = ordered[index]?.id ?? null;
		if (activeId) document.getElementById(`${id}-${activeId}`)?.scrollIntoView({ block: 'nearest' });
	}
	function keydown(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			open = true;
			move(
				event.key === 'ArrowDown'
					? (active + 1) % Math.max(ordered.length, 1)
					: active < 0
						? ordered.length - 1
						: (active - 1 + ordered.length) % ordered.length
			);
		} else if (open && (event.key === 'Home' || event.key === 'End')) {
			event.preventDefault();
			move(event.key === 'Home' ? 0 : ordered.length - 1);
		} else if (open && event.key === 'Enter') {
			const item = ordered[active];
			if (item) {
				event.preventDefault();
				choose(item);
			}
		} else if (event.key === 'Escape') {
			event.preventDefault();
			open = false;
			activeId = null;
		} else if (event.key === 'Tab') {
			open = false;
			activeId = null;
		}
	}
	function globalKey(event: KeyboardEvent) {
		if (!shortcut || event.defaultPrevented) return;
		const target = event.target;
		const editable =
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
		if (
			(event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) ||
			(event.key === '/' && !editable && !event.metaKey && !event.ctrlKey && !event.altKey)
		) {
			event.preventDefault();
			input.focus();
			input.select();
			open = true;
		}
	}
	function match(label: string) {
		const needle = query.trim();
		const index = needle ? label.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
		return index < 0
			? { before: label, match: '', after: '' }
			: {
					before: label.slice(0, index),
					match: label.slice(index, index + needle.length),
					after: label.slice(index + needle.length)
				};
	}
</script>

<svelte:window onkeydown={globalKey} />
<div
	class="search"
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
			open = false;
			activeId = null;
		}
	}}
>
	<label class="field-label" for={id}>{label}</label>
	<div class:expanded class="input-wrap">
		<Icon name="search" size={20} /><input
			{id}
			bind:this={input}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={expanded}
			aria-controls={`${id}-results`}
			aria-activedescendant={open && active >= 0 ? `${id}-${activeId}` : undefined}
			aria-describedby={`${id}-hint`}
			autocomplete="off"
			spellcheck="false"
			{placeholder}
			bind:value={query}
			oninput={() => {
				open = true;
				activeId = null;
				onquery?.(query);
			}}
			onfocus={() => (open = true)}
			onkeydown={keydown}
		/>{#if query}<button
				class="clear"
				type="button"
				aria-label="Clear search"
				onclick={() => {
					query = '';
					activeId = null;
					open = true;
					onquery?.('');
					input.focus();
				}}><Icon name="close" size={16} /></button
			>{:else if shortcut}<kbd aria-hidden="true">/</kbd>{/if}
	</div>
	<span class="sr-only" id={`${id}-hint`}
		>Use up and down arrows to review results, Enter to select, and Escape to close.</span
	>
	<p class="sr-only" role="status">
		{open
			? loading
				? 'Searching…'
				: filtered.length === 0
					? emptyText
					: `${filtered.length} results available.`
			: ''}
	</p>
	<div class="popup" hidden={!open}>
		<div id={`${id}-results`} role="listbox" aria-label={label} aria-busy={loading}>
			{#each groups as group (group.name)}<div role="group" aria-label={group.name}>
					<div class="group-label" aria-hidden="true">{group.name}</div>
					{#each group.items as item (item.id)}{@const parts = match(item.label)}<button
							type="button"
							role="option"
							id={`${id}-${item.id}`}
							aria-selected={activeId === item.id}
							tabindex="-1"
							class="option"
							onpointerdown={(event) => {
								event.preventDefault();
							}}
							onpointermove={() => (activeId = item.id)}
							onclick={() => {
								choose(item);
							}}
							><span class="option-title">{parts.before}<mark>{parts.match}</mark>{parts.after}</span
							>{#if item.detail}<span class="detail">{item.detail}</span
								>{/if}{#if item.variants !== undefined || item.sources !== undefined}<span class="counts"
									>{#if item.variants !== undefined}{item.variants}
										{item.variants === 1
											? 'variant'
											: 'variants'}{/if}{#if item.variants !== undefined && item.sources !== undefined}<span
											aria-hidden="true"
										>
											·
										</span>{/if}{#if item.sources !== undefined}{item.sources}
										{item.sources === 1 ? 'source' : 'sources'}{/if}</span
								>{/if}</button
						>{/each}
				</div>{/each}
		</div>
		{#if loading}<p class="search-state">Searching…</p>{:else if filtered.length === 0}<p
				class="search-state"
			>
				{emptyText}
			</p>{/if}
	</div>
</div>

<style>
	.search {
		position: relative;
	}
	.input-wrap {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 16px;
		min-height: 56px;
		background: var(--surface);
		border: var(--hairline) solid var(--strong-line);
		border-radius: var(--radius);
	}
	.input-wrap:focus-within {
		border-color: var(--accent);
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	.input-wrap > :global(svg) {
		color: var(--muted);
	}
	input {
		width: 100%;
		min-width: 0;
		height: 54px;
		padding: 0;
		background: none;
		border: none;
		outline: none;
		font-size: var(--text-base);
	}
	input::placeholder {
		color: var(--muted);
		opacity: 1;
	}
	kbd {
		font: var(--text-xs) var(--mono);
		color: var(--muted);
		border: var(--hairline) solid var(--line);
		border-radius: 2px;
		padding: 2px 6px;
	}
	.clear {
		border: 0;
		background: none;
		color: var(--muted);
		display: grid;
		place-items: center;
		width: 32px;
		height: 36px;
		padding: 0;
	}
	.popup {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		z-index: var(--z-popup);
		border: var(--hairline) solid var(--strong-line);
		background: var(--surface);
		border-radius: var(--radius);
		overflow: auto;
		max-height: 360px;
	}
	.group-label {
		padding: 12px 16px 8px;
		font: var(--text-xs) var(--mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.option {
		width: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 12px;
		text-align: left;
		border: 0;
		padding: 12px 16px;
		background: none;
		color: var(--ink);
		min-height: 56px;
	}
	.option[aria-selected='true'] {
		background: var(--accent-soft);
	}
	.option-title {
		font-weight: 500;
	}
	mark {
		color: var(--accent);
		background: none;
		font-weight: 700;
	}
	mark:empty {
		display: none;
	}
	.detail {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.counts {
		width: 100%;
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.search-state {
		padding: 20px 16px;
		font-size: var(--text-sm);
		color: var(--muted);
	}
</style>
