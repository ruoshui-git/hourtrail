<script lang="ts">
	import type { BlazeKey } from '@hourtrail/core';
	import Blaze from './Blaze.svelte';
	let {
		name,
		color,
		archived = false,
		size = 'md',
	}: { name: string; color: BlazeKey; archived?: boolean; size?: 'sm' | 'md' } = $props();
</script>

<span class="tag" class:small={size === 'sm'}
	><Blaze {color} {size} {archived} /><span>{name}</span>{#if archived}<span class="archived"
			>Archived</span
		>{/if}</span
>

<style>
	.tag {
		display: inline-flex;
		align-items: center;
		gap: var(--ht-space-2);
		color: var(--ht-ink);
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.small {
		font: var(--ht-type-label);
	}

	.archived {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}
</style>
