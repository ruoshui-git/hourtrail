<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CircleAlert } from '@lucide/svelte';
	const uid = $props.id();
	let {
		label,
		hint,
		error,
		id = uid,
		children,
	}: {
		label: string;
		hint?: string;
		error?: string;
		id?: string;
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	} = $props();
	const describedBy = $derived(
		[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
	);
</script>

<div class="field">
	<label for={id}>{label}</label>
	{@render children({ id, describedBy, invalid: Boolean(error) })}
	{#if hint}<p class="hint" id={`${id}-hint`}>{hint}</p>{/if}
	{#if error}<p class="error" id={`${id}-error`}><CircleAlert aria-hidden="true" />{error}</p>{/if}
</div>

<style>
	.field {
		display: grid;
		/* Keep label, control and hint packed at the top when a grid row is taller. */
		align-content: start;
		gap: var(--ht-space-2);
		min-width: 0;
	}

	label,
	p {
		font: var(--ht-type-label);
	}

	.hint {
		color: var(--ht-ink-2);
	}

	.error {
		display: flex;
		align-items: start;
		gap: var(--ht-space-2);
		color: var(--ht-danger);
	}

	.error :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		flex: none;
		stroke-width: var(--ht-icon-stroke);
	}
</style>
