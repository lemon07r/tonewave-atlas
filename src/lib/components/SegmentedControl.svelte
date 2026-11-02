<script lang="ts" generics="T extends string">
	let {
		label,
		options,
		value = $bindable(),
		onchange,
		disabled = false
	}: {
		label: string;
		options: readonly { value: T; label: string }[];
		value?: T;
		onchange?: (value: T) => void;
		disabled?: boolean;
	} = $props();
	const id = $props.id();
</script>

<div class="segmented" role="group" aria-label={label}>
	{#each options as option (option.value)}
		<label
			><input
				type="radio"
				name={id}
				value={option.value}
				checked={value === option.value}
				{disabled}
				onchange={() => {
					value = option.value;
					onchange?.(option.value);
				}}
			/><span>{option.label}</span></label
		>
	{/each}
</div>
