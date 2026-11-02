<script lang="ts">
	import type { TasteResult } from '#core/atlas/types.ts';
	import type { Form } from '#core/dataset/types.ts';
	import { reasonLabels } from '#lib/profile/profile.ts';
	import { confidenceReason, describeTaste, emptyTasteSummary } from './taste-wording.ts';
	import Notice from '#lib/components/Notice.svelte';
	let { taste, form, nameFor }: { taste: TasteResult; form: Form; nameFor: (id: string) => string } =
		$props();
</script>

<details class="model">
	<summary
		>Taste model · {taste.model.tastes.length}
		{taste.model.tastes.length === 1 ? 'centre' : 'centres'} · {taste.model.confidence.level} support</summary
	>
	{#each taste.model.tastes as target (target.id)}<h3>
			Taste {target.id + 1}: {target.members.map(nameFor).join(', ')}
		</h3>
		{#if target.summary.length}<ul>
				{#each target.summary as statement (statement.band)}<li>{describeTaste(statement, form)}</li>{/each}
			</ul>{:else}<p>{emptyTasteSummary(form)}</p>{/if}
	{/each}
	<ul>
		{#each taste.model.confidence.reasons as reason (reason)}<li>{confidenceReason(reason)}</li>{/each}
	</ul>
	{#each taste.model.conflicts as conflict, i (`${conflict.liked}:${conflict.disliked}:${i}`)}<Notice
			kind="caution"
			>{nameFor(conflict.liked)} and {nameFor(conflict.disliked)}: {conflict.kind === 'near-liked-dislike'
				? 'a liked and disliked product have nearly the same measured shape'
				: `a liked product contradicts the dislike reason ${conflict.reason ? reasonLabels[conflict.reason] : ''}`}.</Notice
		>{/each}
	{#if taste.unusedItems.length}<h3>Not used in this sound model</h3>
		<ul>
			{#each taste.unusedItems as item (`${item.productId}:${item.measurementId}`)}<li>
					{nameFor(item.productId)}: {item.reason.replaceAll('-', ' ')}.
				</li>{/each}
		</ul>{/if}
</details>

<style>
	.model {
		font-size: var(--text-xs);
		padding-block: 16px;
		border-top: 1px solid var(--line);
	}
	summary {
		min-height: 36px;
		cursor: pointer;
		padding-block: 8px;
	}
	h3 {
		font-size: var(--text-sm);
		margin: 16px 0 8px;
	}
	ul {
		padding-left: 20px;
	}
	li {
		margin-block: 6px;
	}
</style>
