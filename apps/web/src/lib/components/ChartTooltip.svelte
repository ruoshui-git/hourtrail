<script lang="ts">
	import type { BlazeKey } from '@hourtrail/core';
	import Blaze from './Blaze.svelte';

	type Row = { key: string; label: string; value: string; color?: BlazeKey };

	let {
		id,
		title,
		rows,
		left,
		align,
	}: {
		id: string;
		title: string;
		rows: Row[];
		left: number;
		align: 'start' | 'center' | 'end';
	} = $props();
</script>

<div {id} role="tooltip" class="tooltip {align}" style:left={`${left}%`}>
	<p class="title">{title}</p>
	<ul>
		{#each rows as row (row.key)}<li>
				<span class="value">{row.value}</span>
				<span class="name"
					>{#if row.color}<Blaze color={row.color} size="sm" />{/if}<span>{row.label}</span></span
				>
			</li>{/each}
	</ul>
</div>

<style>
	.tooltip {
		position: absolute;
		top: 0;
		z-index: var(--ht-z-menu);
		display: grid;
		gap: var(--ht-space-1);
		max-width: 70%;
		padding: var(--ht-space-2) var(--ht-space-3);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-label);
		border: var(--ht-hairline) solid var(--ht-overlay-border);
		border-radius: var(--ht-radius-control);
		box-shadow: var(--ht-shadow-overlay);
		pointer-events: none;
	}

	.start {
		transform: none;
	}

	.center {
		transform: translateX(-50%);
	}

	.end {
		transform: translateX(-100%);
	}

	.title {
		font-weight: var(--ht-weight-strong);
		overflow-wrap: anywhere;
	}

	ul {
		display: grid;
		gap: var(--ht-space-1);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		min-width: 0;
	}

	.value {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.name {
		display: inline-flex;
		align-items: center;
		gap: var(--ht-space-2);
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
