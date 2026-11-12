<script lang="ts">
	import { Info, TriangleAlert } from '@lucide/svelte';
	import Button from './Button.svelte';

	let {
		tone = 'neutral',
		message,
		detail,
		actions = [],
		onreviewed,
		ondismiss,
		state = 'open',
	}: {
		tone?: 'caution' | 'neutral';
		message: string;
		detail?: string;
		actions?: { label: string; onclick: () => void }[];
		onreviewed: () => void;
		ondismiss: () => void;
		state?: 'open' | 'reviewed' | 'dismissed';
	} = $props();
</script>

<article class="review {tone}" data-state={state}>
	<div class="summary">
		<span class="icon" aria-hidden="true">
			{#if tone === 'caution'}<TriangleAlert />{:else}<Info />{/if}
		</span>
		<div class="text">
			<p class="message">{message}</p>
			{#if detail}<p class="detail">{detail}</p>{/if}
		</div>
	</div>

	{#if state === 'open'}
		{#if actions.length > 0}
			<div class="actions">
				{#each actions as action (action.label)}
					<Button variant="secondary" onclick={action.onclick}>{action.label}</Button>
				{/each}
			</div>
		{/if}
		<div class="actions">
			<Button variant="secondary" onclick={onreviewed}>Mark reviewed</Button>
			<Button variant="quiet" onclick={ondismiss}>Dismiss</Button>
		</div>
	{:else}
		<p class="state">{state === 'reviewed' ? 'Reviewed' : 'Dismissed'}</p>
	{/if}
</article>

<style>
	.review {
		display: grid;
		gap: var(--ht-space-3);
		padding-block: var(--ht-space-3);
		border-block-end: var(--ht-hairline) solid var(--ht-line);
		min-width: 0;
	}

	.summary {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--ht-space-3);
		align-items: start;
	}

	.icon {
		display: inline-flex;
		padding-block-start: var(--ht-space-1);
		color: var(--ht-ink-2);
	}

	.caution .icon {
		color: var(--ht-caution);
	}

	.icon :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	.text {
		display: grid;
		gap: var(--ht-space-1);
		min-width: 0;
	}

	.message {
		font: var(--ht-type-body);
		color: var(--ht-ink);
		overflow-wrap: anywhere;
	}

	.detail,
	.state {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ht-space-2);
		padding-inline-start: calc(var(--ht-icon) + var(--ht-space-3));
	}
</style>
