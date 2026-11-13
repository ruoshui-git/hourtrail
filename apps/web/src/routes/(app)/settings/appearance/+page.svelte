<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import { Button, SegmentedControl } from '$lib/components';
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
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Appearance</h1>
</header>
<section aria-label="Appearance">
	<h2>Theme</h2>
	<SegmentedControl bind:value={theme} label="Theme" {options} />
</section>

<style>
	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
		margin-bottom: var(--ht-space-5);
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
