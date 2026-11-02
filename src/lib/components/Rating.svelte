<script lang="ts">
	export type RatingValue = 'unrated' | 'love' | 'like' | 'neutral' | 'dislike';
	let {
		label = 'Your impression',
		value = $bindable(),
		onchange
	}: { label?: string; value?: RatingValue; onchange?: (value: RatingValue) => void } = $props();
	const id = $props.id();
	const ratings = ['unrated', 'love', 'like', 'neutral', 'dislike'] as const;
</script>

<fieldset>
	<legend class="field-label">{label}</legend>
	<div class="ratings">
		{#each ratings as rating (rating)}<label
				><input
					type="radio"
					name={id}
					value={rating}
					checked={value === rating}
					onchange={() => {
						value = rating;
						onchange?.(rating);
					}}
				/><span
					><svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"
						>{#if rating === 'love'}<path
								d="M12 20S3 14.5 3 8.5a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 6-9 11.5-9 11.5Z"
							/>{:else if rating === 'like'}<path
								d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.5l-5.7 3.1 1.1-6.4-4.6-4.5 6.4-.9Z"
							/>{:else if rating === 'neutral'}<circle cx="12" cy="12" r="8" /><path
								d="M8 12h8"
							/>{:else}<circle cx="12" cy="12" r="8" /><path d="m6.5 17.5 11-11" />{/if}</svg
					><span>{rating === 'unrated' ? 'Not rated' : `${rating[0]?.toUpperCase()}${rating.slice(1)}`}</span
					></span
				></label
			>{/each}
	</div>
</fieldset>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	.ratings {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	label {
		position: relative;
	}
	input {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		margin: 0;
	}
	label > span {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px 12px;
		border: var(--hairline) solid var(--strong-line);
		border-radius: var(--radius);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	input:checked + span {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-soft);
	}
	input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
</style>
