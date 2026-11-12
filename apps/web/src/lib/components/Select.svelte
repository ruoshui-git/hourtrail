<script lang="ts">
	let {
		value = $bindable(''),
		options,
		id,
		disabled = false,
		invalid = false,
		describedBy,
	}: {
		value?: string;
		options: { value: string; label: string }[];
		id?: string;
		disabled?: boolean;
		invalid?: boolean;
		describedBy?: string;
	} = $props();
</script>

<select bind:value {id} {disabled} aria-invalid={invalid} aria-describedby={describedBy}
	>{#each options as option (option.value)}<option value={option.value}>{option.label}</option
		>{/each}</select
>

<style>
	select {
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

	select[aria-invalid='true'] {
		border-color: var(--ht-danger);
	}

	select:disabled {
		background: var(--ht-sunken);
		color: var(--ht-ink-3);
		cursor: default;
	}
</style>
