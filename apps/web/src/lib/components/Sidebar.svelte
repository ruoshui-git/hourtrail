<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { DESTINATIONS, DESTINATION_ICONS, type Destination } from './nav';

	let { current, footer }: { current: Destination | null; footer?: Snippet } = $props();
</script>

<nav class="sidebar" aria-label="Main">
	<ul>
		{#each DESTINATIONS as destination (destination.id)}{@const Icon =
				DESTINATION_ICONS[destination.id]}
			{@const selected = destination.id === current}
			<li>
				<a
					href={resolve(destination.href)}
					class:selected
					aria-current={selected ? 'page' : undefined}
				>
					<span class="marker" aria-hidden="true"></span>
					<span class="icon" aria-hidden="true"><Icon /></span>
					<span class="label">{destination.label}</span>
				</a>
			</li>
		{/each}
	</ul>
	{#if footer}<div class="footer">{@render footer()}</div>{/if}
</nav>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: var(--ht-space-5);
		width: var(--ht-sidebar-width);
		min-height: 100%;
		padding: var(--ht-space-5) var(--ht-space-3);
		border-inline-end: var(--ht-hairline) solid var(--ht-line);
		background: var(--ht-paper);
	}

	ul {
		display: grid;
		gap: var(--ht-space-1);
	}

	a {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		padding: var(--ht-space-2) var(--ht-space-3);
		border-radius: var(--ht-radius-control);
		color: var(--ht-ink-2);
		font: var(--ht-type-body);
		text-decoration: none;
	}

	@media (hover: hover) {
		a:hover {
			background: var(--ht-hover);
		}
	}

	a:active {
		background: var(--ht-pressed);
	}

	a.selected {
		color: var(--ht-ink);
		font-weight: var(--ht-weight-strong);
	}

	/* Selected: a short ink marker before the item, never a type colour. */
	.marker {
		display: none;
		flex: none;
		width: var(--ht-nav-marker-w);
		height: var(--ht-nav-marker-h);
		border-radius: var(--ht-radius-blaze);
		background: var(--ht-ink);
	}

	a.selected .marker {
		display: block;
	}

	.icon {
		display: inline-flex;
		flex: none;
	}

	.icon :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	.footer {
		margin-block-start: auto;
	}
</style>
