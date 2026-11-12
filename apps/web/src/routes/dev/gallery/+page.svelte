<script lang="ts">
	import type { Component } from 'svelte';
	import { SegmentedControl } from '$lib/components';
	import { applyTheme, type ThemeChoice } from '$lib/theme';
	let theme = $state('system');
	const sections = Object.entries(
		import.meta.glob<{ default: Component }>('./sections/*.svelte', { eager: true }),
	).sort(([a], [b]) => a.localeCompare(b));
	$effect(() => applyTheme(theme as ThemeChoice));
</script>

<svelte:head><title>Component gallery | Hourtrail</title></svelte:head>
<main data-gallery-ready>
	<header>
		<h1>Component gallery</h1>
		<p>Blaze primitives for Hourtrail</p>
		<SegmentedControl
			label="Theme"
			bind:value={theme}
			options={[
				{ value: 'system', label: 'System' },
				{ value: 'light', label: 'Light' },
				{ value: 'dark', label: 'Dark' },
			]}
		/>
	</header>
	{#each sections as [path, section] (path)}{@const Section = section.default}<Section />{/each}
</main>

<style>
	main {
		max-width: calc(var(--ht-measure) + var(--ht-gutter) * 2);
		margin-inline: auto;
		padding: var(--ht-space-6) max(var(--ht-gutter), env(safe-area-inset-right)) var(--ht-space-8)
			max(var(--ht-gutter), env(safe-area-inset-left));
	}

	header {
		display: grid;
		gap: var(--ht-space-4);
		padding-bottom: var(--ht-space-6);
	}

	header p {
		color: var(--ht-ink-2);
	}

	main :global(section) {
		padding-block: var(--ht-space-6);
		border-top: var(--ht-hairline) solid var(--ht-line);
		display: grid;
		gap: var(--ht-space-5);
		min-width: 0;
	}

	main :global(.examples) {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--ht-space-3);
	}

	main :global(.stack) {
		display: grid;
		align-content: start;
		gap: var(--ht-space-4);
		min-width: 0;
	}

	main :global(.sample) {
		display: grid;
		gap: var(--ht-space-2);
		min-width: 0;
	}

	main :global(.caption) {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}

	main :global(.columns) {
		display: grid;
		align-items: start;
		gap: var(--ht-space-5);
		min-width: 0;
	}

	@media (width >= 768px) {
		main :global(.columns) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
