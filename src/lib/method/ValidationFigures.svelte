<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AtlasSummary } from '#core/atlas/types.ts';
	import type { Form } from '#core/dataset/types.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import { loadValidation, type ValidationFigure } from './validation.ts';
	let { summary, form }: { summary: AtlasSummary; form: Form } = $props();
	let figures = $state.raw<ValidationFigure[]>([]),
		error = $state(''),
		loading = $state(true);
	$effect(() => {
		const abort = new AbortController();
		figures = [];
		error = '';
		loading = true;
		void loadValidation(`${resolve('/')}data/${summary.version}/catalog-${form}.json.gz`, abort.signal)
			.then(
				(data) => {
					if (!abort.signal.aborted) figures = data;
				},
				(cause: unknown) => {
					if (!abort.signal.aborted)
						error = cause instanceof Error ? cause.message : 'Validation metadata could not be loaded.';
				}
			)
			.finally(() => {
				if (!abort.signal.aborted) loading = false;
			});
		return () => {
			abort.abort();
		};
	});
	const db = (value: number | null) => (value === null ? 'not reported' : `${value.toFixed(3)} dB`);
	const count = (value: number | null) => (value === null ? 'not reported' : value.toLocaleString('en-US'));
</script>

<div class="validation" role="region" aria-label="Published dataset validation">
	<p>
		Dataset <span class="mono">{summary.version}</span> · built {summary.builtAt.slice(0, 10)}. Figures below
		come from this build’s published partition metadata.
	</p>
	{#if loading}<p role="status">Loading held-out validation figures…</p>{:else if error}<p role="alert">
			{error} No validation figures are substituted.
		</p>{:else}
		{#each figures as figure (figure.id)}<section aria-label={`${figure.id} validation`}>
				<h3>{rigLabel(figure.id, summary.sources)} <span class="mono">({figure.id})</span></h3>
				<p>
					{figure.support}. Multi-source products: {count(figure.products)}; sources: {count(figure.sources)}.
				</p>
				<dl>
					<div>
						<dt>Held-out same-product pairs</dt>
						<dd>{count(figure.pairs)}</dd>
					</div>
					<div>
						<dt>Validation folds</dt>
						<dd>{count(figure.folds)}</dd>
					</div>
					<div>
						<dt>Pooled mean distance, before → after</dt>
						<dd>{db(figure.before)} → {db(figure.after)}</dd>
					</div>
					<div>
						<dt>Pooled median distance before correction</dt>
						<dd>{db(figure.medianBefore)}</dd>
					</div>
					<div>
						<dt>Fold mean improvements (positive is a reduction)</dt>
						<dd>
							{figure.improvements.length
								? `${db(Math.min(...figure.improvements))} to ${db(Math.max(...figure.improvements))}`
								: 'not reported'}
						</dd>
					</div>
				</dl>
			</section>{:else}<p>No validation metadata is published for this form factor.</p>{/each}
	{/if}
</div>

<style>
	.validation {
		margin-block: 24px;
	}
	section {
		border-top: 1px solid var(--line);
		padding-block: 20px;
	}
	h3 {
		font-size: var(--text-sm);
	}
	h3 span {
		font-size: var(--text-xs);
	}
	p {
		color: var(--muted);
		margin-block: 12px;
		font-size: var(--text-sm);
	}
	dl {
		font-size: var(--text-sm);
	}
	dl div {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 16px;
		padding-block: 8px;
	}
	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 500px) {
		dl div {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
