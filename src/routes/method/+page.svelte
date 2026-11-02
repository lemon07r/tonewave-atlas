<script lang="ts">
	import { resolve } from '$app/paths';
	import Notice from '#lib/components/Notice.svelte';
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
			><a href="#sources">Sources & attribution</a><a href="#privacy">Local by design</a>
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
					Different measurement rigs can give different responses for the same product. Matching will keep rig
					families separate rather than quietly treating a 711-family coupler and a B&K 5128 as
					interchangeable.
				</p>
				<p>
					The difference view subtracts a selected baseline at each frequency. Zero means equal measured level
					at that point; positive means more, negative means less. It does not automatically align the curves.
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
					Where supplied, shaded envelopes show lower and upper bounds alongside a curve. Their meaning must
					come from the source or analysis that produced them; a band is not automatically a confidence
					interval.
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
					No measurement dataset is connected in this preview. When data is available, each curve must retain
					its source, rig, variant and processing details. PNG exports include the attribution supplied with
					the chart.
				</p>
				<p>
					The planned catalog draws on publicly shared measurement databases. Public availability is not
					permission to erase authorship: source links and reuse terms must travel with the data. A product
					with several sources should show their disagreement, not only its most flattering curve.
				</p>
			</section>
			<section id="privacy">
				<span class="eyebrow">05 / Local by design</span>
				<h2>Your taste stays yours.</h2>
				<p>
					There is no account and no tracking. Analysis is designed to run in your browser. The theme
					preference is stored locally; taste profiles and shareable comparison settings will be connected in
					the next phase.
				</p>
				<a class="method-back" href={resolve('/')}>Back to Discover <span aria-hidden="true">→</span></a>
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
			grid-template-columns: 1fr;
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
