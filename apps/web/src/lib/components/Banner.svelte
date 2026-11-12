<script lang="ts">
	import type { Component } from 'svelte';
	import { CircleAlert, Info, OctagonAlert, TriangleAlert } from '@lucide/svelte';
	import Button from './Button.svelte';
	let {
		tone = 'neutral',
		message,
		action,
	}: {
		tone?: 'neutral' | 'caution' | 'danger';
		message: string;
		action?: { label: string; onclick: () => void };
	} = $props();

	const icons: Record<string, Component> = {
		neutral: Info,
		caution: TriangleAlert,
		danger: OctagonAlert,
	};
	const Icon = $derived(icons[tone] ?? CircleAlert);
</script>

<div class="banner {tone}" role={tone === 'danger' ? 'alert' : 'status'}>
	<span class="icon" aria-hidden="true"><Icon /></span>
	<p>{message}</p>
	{#if action}
		<Button variant="quiet" onclick={action.onclick}>{action.label}</Button>
	{/if}
</div>

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		padding-block: var(--ht-space-3);
		border-block: var(--ht-hairline) solid var(--ht-line);
		color: var(--ht-ink);
		font: var(--ht-type-body);
	}

	.banner p {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.icon {
		display: inline-flex;
		flex: none;
		color: var(--ht-ink-2);
	}

	.icon :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	.caution .icon {
		color: var(--ht-caution);
	}

	.danger .icon {
		color: var(--ht-danger);
	}
</style>
