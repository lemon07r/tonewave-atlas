<script lang="ts">
	import type { AtlasSummary } from '#core/atlas/types.ts';
	import { rigLabel } from '#lib/rigs.ts';
	let {
		sources,
		selected,
		onchange
	}: { sources: AtlasSummary['sources']; selected: string[]; onchange: (ids: string[]) => void } = $props();
	let query = $state('');
	let visible = $derived(
		sources.filter((source) => source.name.toLowerCase().includes(query.trim().toLowerCase()))
	);
	let groups = $derived([...new Set(visible.map((source) => source.partition))]);
</script>

<section class="source-filter" aria-label="Reviewer filter">
	<h3>Products measured by these reviewers</h3>
	<p>
		{selected.length ? `${selected.length} selected` : 'All reviewers'} · rankings still use all eligible measurements
		of each product.
	</p>
	<div class="source-tools">
		<label class="field-label"
			>Search reviewers<input class="text-input" type="search" bind:value={query} /></label
		><button
			type="button"
			onclick={() => {
				query = '';
				onchange([]);
			}}>Reset reviewers</button
		>
	</div>
	<div class="source-options">
		{#each groups as group (group)}<fieldset>
				<legend>{rigLabel(group, sources)}</legend
				>{#each visible.filter((source) => source.partition === group) as source (source.id)}<label
						><input
							type="checkbox"
							checked={selected.includes(source.id)}
							onchange={(event) => {
								onchange(
									event.currentTarget.checked
										? [...selected, source.id]
										: selected.filter((id) => id !== source.id)
								);
							}}
						/>{source.name}</label
					>{/each}
			</fieldset>{/each}{#if !visible.length}<p>No reviewers match this search.</p>{/if}
	</div>
</section>

<style>
	h3 {
		font-size: var(--text-sm);
	}
	p,
	legend {
		font-size: var(--text-xs);
		color: var(--muted);
		margin: 8px 0;
	}
	.source-tools {
		display: flex;
		gap: 12px;
		align-items: end;
		margin-block: 12px;
		flex-wrap: wrap;
	}
	input[type='search'] {
		display: block;
		width: 100%;
		margin-top: 8px;
	}
	button {
		min-height: 36px;
		padding: 8px;
		color: var(--accent);
		border: 0;
		background: none;
		text-decoration: underline;
	}
	.source-options {
		max-height: 260px;
		overflow: auto;
		padding: 4px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 16px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px 12px;
	}
	label:not(.field-label) {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		font-size: var(--text-xs);
	}
	input {
		accent-color: var(--accent);
	}
	@media (max-width: 420px) {
		fieldset {
			grid-template-columns: 1fr;
		}
	}
</style>
