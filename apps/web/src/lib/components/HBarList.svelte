<script lang="ts">
	import type { BlazeKey } from '@hourtrail/core';
	import { formatMinutes } from './chart';

	type Item = {
		id: string;
		label: string;
		color: BlazeKey;
		minutes: number;
		secondary?: string;
	};

	let {
		title,
		items,
		max,
		format = 'hm',
	}: { title: string; items: Item[]; max?: number; format?: 'hm' | 'decimal' } = $props();

	const scale = $derived(
		max !== undefined && max > 0 ? max : Math.max(0, ...items.map((item) => item.minutes)),
	);
	const hasData = $derived(items.some((item) => item.minutes > 0));
</script>

{#if !hasData}
	<p class="empty">Nothing recorded in this range.</p>
{:else}
	<ol class="list" aria-label={title}>
		{#each items as item (item.id)}<li class="row">
				<div class="head">
					<span class="name">
						<span>{item.label}</span>
						{#if item.secondary}<span class="secondary">{item.secondary}</span>{/if}
					</span>
					<span class="value">{formatMinutes(item.minutes, format)}</span>
				</div>
				<div class="track" aria-hidden="true">
					<span
						class="bar"
						style:--blaze={`var(--ht-blaze-${item.color})`}
						style:width={`${scale > 0 ? Math.min(100, (item.minutes / scale) * 100) : 0}%`}
					></span>
				</div>
			</li>{/each}
	</ol>
{/if}

<style>
	.empty {
		font: var(--ht-type-body);
		color: var(--ht-ink-2);
	}

	.list {
		display: grid;
		gap: var(--ht-space-4);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--ht-space-3);
		font: var(--ht-type-body);
		color: var(--ht-ink);
	}

	.name {
		display: grid;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.secondary {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}

	.value {
		flex: none;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.track {
		margin-top: var(--ht-space-2);
		height: var(--ht-bar);
		background: var(--ht-sunken);
		border-radius: var(--ht-radius-blaze);
	}

	.bar {
		display: block;
		height: 100%;
		min-width: 0;
		background: var(--blaze);
		border-radius: var(--ht-radius-blaze);
	}
</style>
