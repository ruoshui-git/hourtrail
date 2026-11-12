<script lang="ts">
	let {
		value = $bindable(''),
		id,
		min,
		max,
		disabled = false,
		invalid = false,
		describedBy,
	}: {
		value?: string;
		id?: string;
		min?: string;
		max?: string;
		disabled?: boolean;
		invalid?: boolean;
		describedBy?: string;
	} = $props();
</script>

<input
	type="datetime-local"
	step="60"
	bind:value
	{id}
	{min}
	{max}
	{disabled}
	aria-invalid={invalid}
	aria-describedby={describedBy}
/>

<style>
	input {
		width: 100%;
		min-width: 0;
		min-height: var(--ht-control-height);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		padding: var(--ht-space-2) var(--ht-space-3);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-body);
	}

	input[aria-invalid='true'] {
		border-color: var(--ht-danger);
	}

	input:disabled {
		background: var(--ht-sunken);
		color: var(--ht-ink-3);
		cursor: default;
	}

	input::placeholder {
		color: var(--ht-ink-3);
		opacity: 1;
	}
</style>
