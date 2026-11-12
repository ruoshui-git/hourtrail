<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import Button from './Button.svelte';
	let {
		message,
		actionLabel,
		onaction,
	}: {
		message: string;
		actionLabel?: string;
		onaction?: () => void;
	} = $props();
</script>

<div class="empty">
	<p>{message}</p>
	{#if actionLabel}
		<Button variant="secondary" icon={Plus} onclick={onaction}>{actionLabel}</Button>
	{/if}
</div>

<style>
	.empty {
		display: grid;
		justify-items: start;
		gap: var(--ht-space-4);
		padding-block: var(--ht-space-6);
		color: var(--ht-ink-2);
		font: var(--ht-type-body);
	}
</style>
