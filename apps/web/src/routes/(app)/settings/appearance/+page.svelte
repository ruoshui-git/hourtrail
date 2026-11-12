<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { SegmentedControl } from '$lib/components';
	import { getTheme, setLocal } from '$lib/features/settings/local';
	import { applyTheme, type ThemeChoice } from '$lib/theme';
	let theme = $state<ThemeChoice>('system');
	let loaded = $state(false);
	const options = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
	];
	onMount(async () => {
		theme = await getTheme();
		loaded = true;
	});
	$effect(() => {
		applyTheme(theme);
		if (loaded) void setLocal('theme', theme);
	});
</script>

<svelte:head><title>Appearance · Settings · Hourtrail</title></svelte:head>
<a href={resolve('/settings')}>Settings</a>
<h1>Appearance</h1>
<section aria-label="Appearance">
	<h2>Theme</h2>
	<SegmentedControl bind:value={theme} label="Theme" {options} />
</section>

<style>
	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--ht-target);
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	h1 {
		margin: var(--ht-space-3) 0 var(--ht-space-5);
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	section {
		max-width: var(--ht-content-max);
	}

	h2 {
		margin: 0 0 var(--ht-space-3);
		font: var(--ht-type-heading);
		color: var(--ht-ink);
	}
</style>
