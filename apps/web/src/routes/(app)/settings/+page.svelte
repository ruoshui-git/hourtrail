<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ChevronRight } from '@lucide/svelte';
	const sections = [
		'Activity types',
		'Places',
		'Reminders',
		'Cloud and devices',
		'Privacy',
		'Backup',
		'Appearance',
		'Time zone and week start',
		'Deleted sessions',
		'About',
	];
	const active = $derived(
		page.url.pathname === '/settings' ? '' : page.url.pathname.split('/').at(-1),
	);
</script>

<svelte:head><title>Settings · Hourtrail</title></svelte:head>
<h1>Settings</h1>
<nav aria-label="Settings">
	{#each sections as section (section)}
		{#if section === 'Activity types'}
			<a
				class="row"
				href={resolve('/settings/types')}
				aria-current={active === 'types' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else if section === 'Backup'}
			<a
				class="row"
				href={resolve('/settings/backup')}
				aria-current={active === 'backup' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else if section === 'Appearance'}
			<a
				class="row"
				href={resolve('/settings/appearance')}
				aria-current={active === 'appearance' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else}
			<div class="row unavailable"><span>{section}</span><span>Coming soon</span></div>
		{/if}
	{/each}
</nav>

<style>
	h1 {
		margin: 0 0 var(--ht-space-5);
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	nav {
		max-width: var(--ht-content-max);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		padding: var(--ht-space-3) 0;
		border-bottom: var(--ht-hairline) solid var(--ht-line);
		color: var(--ht-ink);
		font: var(--ht-type-body);
		text-decoration: none;
	}

	.row :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		flex: none;
	}

	.unavailable {
		color: var(--ht-ink-2);
	}

	.unavailable span:last-child {
		font: var(--ht-type-label);
	}

	a:focus-visible {
		outline: var(--ht-focus-width) solid var(--ht-ink);
		outline-offset: var(--ht-focus-offset);
	}
</style>
