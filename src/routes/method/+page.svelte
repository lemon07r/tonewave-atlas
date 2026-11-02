<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { analysis, formFromUrl } from '#lib/atlas.ts';
	import { dateLabel } from '#lib/product/data.ts';
	import { rigLabel } from '#lib/rigs.ts';
	import type { AtlasSummary } from '#core/atlas/types.ts';
	import type { ReferenceTarget } from '#core/dataset/types.ts';
	import Notice from '#lib/components/Notice.svelte';
	let summary = $state.raw<AtlasSummary | null>(null);
	let error = $state('');
	let targets = $state.raw<ReferenceTarget[]>([]);
	let targetError = $state('');
	let targetsLoading = $state(true);
	let form = $derived(browser ? formFromUrl(new URL(page.url.href)) : 'iem');
	let sources = $derived(summary?.sources.filter((s) => s.form === form) ?? []);
	$effect(() => {
		let active = true;
		error = '';
		summary = null;
		void analysis()
			.then((service) => service.summary())
			.then((data) => {
				if (!active) return;
				summary = data;
			})
			.catch((e: unknown) => {
				if (active) error = String(e);
			});
		return () => {
			active = false;
		};
	});
	$effect(() => {
		const selectedForm = form;
		let active = true;
		targets = [];
		targetError = '';
		targetsLoading = true;
		void analysis()
			.then((service) => service.targets(selectedForm))
			.then((data) => {
				if (active) targets = data;
			})
			.catch((cause: unknown) => {
				if (active) targetError = cause instanceof Error ? cause.message : String(cause);
			})
			.finally(() => {
				if (active) targetsLoading = false;
			});
		return () => {
			active = false;
		};
	});
</script>

<svelte:head
	><title>Method — Tonewave Atlas</title><meta
		name="description"
		content="What frequency-response measurements can tell you, where they fall short, and how Tonewave Atlas treats sources and uncertainty."
	/></svelte:head
>
<div class="page method">
	<div class="page-heading">
		<p class="eyebrow">Method / A note on evidence</p>
		<h1>A map is not the music.</h1>
		<p>
			Frequency response is useful evidence about tonal balance. It is not a complete description of sound,
			and it is never a substitute for your own ears.
		</p>
	</div>
	<div class="method-grid">
		<nav aria-label="On this page">
			<p class="eyebrow">On this page</p>
			<a href="#reading">Reading a response</a><a href="#comparison">Fair comparisons</a><a
				href="#uncertainty">Honest uncertainty</a
			><a href="#harmonisation">Reviewer offsets</a><a href="#sources">Sources & attribution</a><a
				href="#privacy">Local by design</a
			>
		</nav>
		<article>
			<section id="reading">
				<span class="eyebrow">01 / Reading a response</span>
				<h2>What does a curve tell you?</h2>
				<p>
					A frequency-response curve shows the measured level at different frequencies. The left is bass; the
					right is treble. A higher line means more measured energy at that frequency, not better sound.
				</p>
				<p>
					The chart uses a logarithmic frequency axis, from 20 Hz to 20 kHz. Equal distances represent equal
					frequency ratios. Values between measured points are shown on a common grid; missing coverage stays
					missing.
				</p>
				<Notice
					>Chart levels are relative, not a claim about your listening volume. A target is a reference for
					comparison, not a universal ideal.</Notice
				>
			</section>
			<section id="comparison">
				<span class="eyebrow">02 / Fair comparisons</span>
				<h2>Compare like with like.</h2>
				<p>
					Matching measures response distance: the weighted RMS difference in measured shape, in dB. Lower
					means closer on the rig, not a percentage match or a prediction of enjoyment. A weighted
					least-squares level offset removes differences in overall measurement level before comparison.
				</p>
				<p>
					Balanced weighting gives less influence to uncertain high frequencies. Bass, vocal and treble focus
					change the weights, not the underlying measurements. Partition statistics inform reliability where
					supported; otherwise matching uses a conservative default profile, not measured error bars.
				</p>
				<p>
					A product reference is the aligned, per-frequency median of its default measurements within one rig
					partition. Tunings are separate opt-in candidates, not quietly averaged into the default. Fit and
					unit variants remain inspectable evidence of variation. A per-reviewer distance range is the
					observed minimum and maximum distance to the reference, not a confidence interval.
				</p>
				<p>
					711-family and B&K 5128 rigs are never pooled or ranked together; headphone rigs have separate
					partitions too. Compare can explicitly overlay different rigs, with a caution and rig labels. Its
					curves first receive the same balanced, reliability-weighted level offset to the first curve. The
					difference view then subtracts the selected baseline point by point, without an extra alignment.
				</p>
			</section>
			<section id="harmonisation">
				<h2>Reviewer offsets, not rig conversion.</h2>
				<p>
					Similar and taste matching correct reviewer offsets by default only when partition support is
					sufficient and pooled mean improvement is positive overall and in every held-out fold. Otherwise
					correction stays off; explicit correction requests without sufficient support are rejected. Detail
					charts and EQ use uncorrected curves.
				</p>
				<p>
					In the 2026-11 dataset build, five-fold validation on iem-711 reduced held-out same-product pair
					distance from 1.781 to 1.588 dB (−10.9%) across 50,823 pairs; fold improvements were 0.184–0.202 dB.
					This is not physical calibration, rig conversion or evidence of listener preference.
				</p>
			</section>
			<section id="uncertainty">
				<span class="eyebrow">03 / Honest uncertainty</span>
				<h2>Precision is not certainty.</h2>
				<p>
					Seal, tips, insertion depth, unit variation and measurement setup can all change a curve.
					Upper-treble measurements deserve particular caution. Your ear and the measurement coupler are not
					the same acoustic system.
				</p>
				<p>
					Product shading shows the minimum and maximum of the aligned default measurements when at least two
					sources contribute. It describes the available observations, not the range of all units or a
					statistical confidence interval. A single source does not establish certainty.
				</p>
				<p>
					Frequency response alone does not describe distortion, spatial perception or every aspect of a
					listening experience. We do not turn it into an invented “sound quality” score.
				</p>
			</section>
			<section id="sources">
				<span class="eyebrow">04 / Sources & attribution</span>
				<h2>The measurements belong in the story.</h2>
				<p>
					The catalog draws from public squig.link reviewer databases. Each measurement retains its source,
					rig, original files, variant and processing history. Product pages link to that evidence, and PNG
					exports retain curve attribution. Hardware and reviewer-listed USD prices are not independently
					verified.
				</p>
				<p>
					Public availability is not a redistribution licence. Unless explicitly granted, permission is
					“public, not explicitly licensed.” Attribution is not a substitute for permission. We publish
					resampled curves, not raw text files, and honour source-owner removal requests through exclusions
					and a rebuild. For correction, exclusion or takedown, <a
						href="https://github.com/lemon07r/tonewave-atlas/issues">open a GitHub issue</a
					>.
				</p>
				{#if error}<Notice kind="caution" title="Source data unavailable">{error}</Notice
					>{:else if !summary}<p role="status">Loading dataset sources…</p>{:else}
					<p class="small mono">
						Dataset {summary.version}<br />Built {new Date(summary.builtAt).toISOString().slice(0, 10)} · {form ===
						'headphone'
							? 'Headphone'
							: 'IEM'} sources
					</p>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (The overflowing source table must be keyboard-scrollable.) -->
					<div class="source-table" role="region" aria-label="Scrollable measurement sources" tabindex="0">
						<table aria-label="Measurement data sources">
							<thead
								><tr
									><th scope="col">Source</th><th scope="col">Rig / partition</th><th scope="col"
										>Measurements</th
									><th scope="col">Crawled</th><th scope="col">Permission</th></tr
								></thead
							><tbody
								>{#each sources as source (source.id)}<tr
										><th scope="row"><a href={source.url} rel="external">{source.name}</a></th><td
											>{source.rig || rigLabel(source.partition, summary.sources)}{source.rigInferred
												? ' (inferred)'
												: ''}<br /><span class="mono">{source.partition}</span></td
										><td>{source.measurementCount}</td><td>{dateLabel(source.crawledAt)}</td><td
											>{source.permission}</td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>
				{/if}
				<h3>Reference targets</h3>
				{#if targetError}<Notice kind="caution" title="Reference targets unavailable">{targetError}</Notice
					>{/if}
				{#each targets as target (target.id)}<div>
						<h4>{target.name}</h4>
						<p>{target.description} Compatible partitions: {target.partitions.join(', ')}.</p>
						<p>{target.attribution} <a href={target.provenance.upstream} rel="external">Target source</a></p>
					</div>{:else}{#if !targetsLoading && !targetError}<p>
							No published reference targets for this form factor.
						</p>{/if}{/each}
				<p>
					Full definitions: <a href="https://github.com/lemon07r/tonewave-atlas/blob/main/docs/METHODOLOGY.md"
						>methodology and maths</a
					>
					·
					<a href="https://github.com/lemon07r/tonewave-atlas/blob/main/docs/DATA_SOURCES.md"
						>data sources and rights</a
					>.
				</p>
			</section>
			<section id="privacy">
				<span class="eyebrow">05 / Local by design</span>
				<h2>Your taste stays yours.</h2>
				<p>
					There is no account and no tracking. Curve analysis and EQ fitting run in your browser’s worker.
					Uploaded measurement text is never sent to a server. Theme preference stays locally; comparison
					product and measurement IDs, channel, smoothing and baseline can be shared in the URL.
				</p>
				<p>
					Product or rig-matched reference-target EQ fits a constrained 48 kHz filter response. Its
					before/after distance is the level-aligned RMS residual over 20 Hz–10 kHz. Notches and high
					frequencies are treated conservatively. This approximates the target curve on the same rig, not its
					sound in your ear.
				</p>
				<a class="method-back" href={resolve(`/${form === 'headphone' ? '?form=headphones' : ''}`)}
					>Back to Discover <span aria-hidden="true">→</span></a
				>
			</section>
		</article>
	</div>
</div>

<style>
	.method .page-heading {
		max-width: 860px;
	}
	.method .page-heading > p:not(.eyebrow) {
		max-width: 62ch;
		font-size: var(--text-lg);
	}
	.method-grid {
		display: grid;
		grid-template-columns: 228px minmax(0, 720px);
		gap: 64px;
		margin-top: 56px;
	}
	.method-grid nav {
		display: flex;
		flex-direction: column;
		gap: 0;
		position: sticky;
		top: 32px;
		align-self: start;
	}
	.method-grid nav .eyebrow {
		margin-bottom: 16px;
	}
	.method-grid nav a {
		color: var(--muted);
		text-decoration: none;
		font-size: var(--text-sm);
		padding: 10px 0;
	}
	.method-grid nav a:hover {
		color: var(--accent);
		text-decoration: underline;
	}
	article section {
		padding-bottom: 40px;
		margin-bottom: 40px;
		border-bottom: var(--hairline) solid var(--line);
		scroll-margin-top: 32px;
	}
	article {
		min-width: 0;
	}
	article section:last-child {
		border: 0;
		margin-bottom: 0;
		padding-bottom: 0;
	}
	article h2 {
		margin: 12px 0 20px;
		font-size: 26px;
	}
	article p {
		color: var(--muted);
		margin: 16px 0;
		line-height: 1.75;
	}
	article :global(.notice) {
		margin-top: 24px;
	}
	.source-table {
		overflow-x: auto;
		max-width: 100%;
		margin: 24px 0;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: var(--text-xs);
	}
	th,
	td {
		text-align: left;
		padding: 12px 8px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	td .mono {
		overflow-wrap: anywhere;
	}
	.method-back {
		display: inline-block;
		margin-top: 16px;
		font-size: var(--text-sm);
	}
	@media (max-width: 1050px) {
		.method-grid {
			grid-template-columns: 190px minmax(0, 1fr);
			gap: 32px;
		}
	}
	@media (max-width: 700px) {
		.method-grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 36px;
			margin-top: 36px;
		}
		.method-grid nav {
			position: static;
			border-top: var(--hairline) solid var(--line);
			padding-top: 20px;
		}
		.method-grid nav a {
			min-height: 44px;
		}
		article h2 {
			font-size: 23px;
		}
		article section {
			margin-bottom: 32px;
			padding-bottom: 32px;
		}
	}
</style>
