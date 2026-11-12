<script lang="ts">
	let {
		value = $bindable(''),
		id,
		placeholder,
		rows = 3,
		disabled = false,
		invalid = false,
		describedBy,
	}: {
		value?: string;
		id?: string;
		placeholder?: string;
		rows?: number;
		disabled?: boolean;
		invalid?: boolean;
		describedBy?: string;
	} = $props();
</script>

<div class="grow" data-content={value + ' '}>
	<textarea
		bind:value
		{id}
		{placeholder}
		{rows}
		{disabled}
		aria-invalid={invalid}
		aria-describedby={describedBy}></textarea>
</div>

<style>
	.grow {
		display: grid;
		min-width: 0;
	}

	.grow::after {
		content: attr(data-content);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		visibility: hidden;
	}

	textarea {
		resize: none;
		overflow: hidden;
	}

	textarea,
	.grow::after {
		grid-area: 1 / 1;
		width: 100%;
		min-width: 0;
		min-height: var(--ht-control-height);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		padding: var(--ht-space-3);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-body);
	}

	textarea[aria-invalid='true'] {
		border-color: var(--ht-danger);
	}

	textarea:disabled {
		background: var(--ht-sunken);
		color: var(--ht-ink-3);
		cursor: default;
	}

	textarea::placeholder {
		color: var(--ht-ink-3);
		opacity: 1;
	}
</style>
