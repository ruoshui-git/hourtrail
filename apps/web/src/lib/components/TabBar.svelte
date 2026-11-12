<script lang="ts">
	import { resolve } from '$app/paths';
	import { DESTINATIONS, DESTINATION_ICONS, type Destination } from './nav';

	let { current }: { current: Destination | null } = $props();
</script>

<nav class="tabbar" aria-label="Main">
	<ul>
		{#each DESTINATIONS as destination (destination.id)}{@const Icon =
				DESTINATION_ICONS[destination.id]}
			{@const selected = destination.id === current}
			<li>
				<a
					href={resolve(destination.href as Parameters<typeof resolve>[0])}
					class:selected
					aria-current={selected ? 'page' : undefined}
				>
					<span class="icon" aria-hidden="true"><Icon /></span>
					<span class="label">{destination.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.tabbar {
		background: var(--ht-surface);
		border-top: var(--ht-hairline) solid var(--ht-line);
		padding-bottom: env(safe-area-inset-bottom);
	}

	ul {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}

	a {
		position: relative;
		display: grid;
		justify-items: center;
		align-content: center;
		gap: var(--ht-space-1);
		min-height: calc(var(--ht-target) + var(--ht-space-2));
		padding: var(--ht-space-2) var(--ht-space-1);
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
		text-decoration: none;
		overflow-wrap: anywhere;
		text-align: center;
	}

	a.selected {
		color: var(--ht-ink);
		font-weight: var(--ht-weight-strong);
	}

	/* Selected: a short ink marker on the top edge of the item, never a type colour. */
	a.selected::before {
		content: '';
		position: absolute;
		top: 0;
		inset-inline-start: 50%;
		width: var(--ht-nav-marker-w);
		height: var(--ht-nav-marker-h);
		margin-inline-start: calc(var(--ht-nav-marker-w) / -2);
		border-radius: var(--ht-radius-blaze);
		background: var(--ht-ink);
	}

	.icon {
		display: inline-flex;
	}

	.icon :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	.label {
		font: var(--ht-type-caption);
	}
</style>
