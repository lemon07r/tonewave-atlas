<script lang="ts">
	import type { AtlasSummary, SourceMode } from '#core/atlas/types.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import { sourcePartitions } from '#lib/sources.ts';
	let {
		sources,
		partition = '',
		partitions,
		selected,
		mode,
		onchange,
		onmodechange
	}: {
		sources: AtlasSummary['sources'];
		partition?: string;
		partitions?: readonly string[];
		selected: string[];
		mode: SourceMode;
		onchange: (ids: string[]) => void;
		onmodechange: (mode: SourceMode) => void;
	} = $props();
	let query = $state('');
	let hiddenSelected = $derived(selected.filter((id) => !sources.some((source) => source.id === id)));
	let visible = $derived(
		sources.filter((source) => source.name.toLowerCase().includes(query.trim().toLowerCase()))
	);
	let groups = $derived(
		[...new Set(visible.flatMap((source) => [...sourcePartitions(source)]))].filter(
			(group) => (!partition || group === partition) && (!partitions || partitions.includes(group))
		)
	);
</script>

<section class="source-filter" aria-label="Reviewer filter">
	<h3>Reviewer measurements</h3>
	<label class="field-label"
		>Reviewer scoring mode<select
			value={mode}
			onchange={(event) => {
				onmodechange(event.currentTarget.value === 'only' ? 'only' : 'coverage');
			}}
		>
			<option value="coverage">Reviewer coverage · score all sources</option>
			<option value="only" disabled={!selected.length}>Selected measurements only</option>
		</select></label
	>
	<p>
		{selected.length ? `${selected.length} selected` : 'All reviewers'} · {mode === 'only'
			? 'reference and candidate curves use only selected reviewers. References without those measurements cannot be used.'
			: 'products must be measured by a selected reviewer; reference and candidate curves use all eligible sources.'}
	</p>
	{#if hiddenSelected.length}<p>
			{`${hiddenSelected.length} selected reviewer${hiddenSelected.length === 1 ? ' is' : 's are'} outside this rig’s list.`}
			They still scope matching; reset reviewers to clear them.
		</p>{/if}
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
				>{#each visible.filter( (source) => sourcePartitions(source).includes(group) ) as source (source.id)}<label
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
	select {
		display: block;
		width: 100%;
		min-width: 0;
		margin-top: 8px;
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
