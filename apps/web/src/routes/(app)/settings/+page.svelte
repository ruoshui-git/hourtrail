<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ChevronRight } from '@lucide/svelte';
	const sections = [
		'Activity types',
		'Places',
		'Projects',
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
<header><h1>Settings</h1></header>
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
		{:else if section === 'Places'}
			<a
				class="row"
				href={resolve('/settings/places')}
				aria-current={active === 'places' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else if section === 'Projects'}
			<!-- The Projects destination is being added in parallel in task 5.3. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -- task 5.3 adds the typed route. -->
			<a
				class="row"
				href="/items/projects"
				aria-current={active === 'projects' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{:else if section === 'Time zone and week start'}
			<a
				class="row"
				href={resolve('/settings/time')}
				aria-current={active === 'time' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else if section === 'Deleted sessions'}
			<a
				class="row"
				href={resolve('/settings/deleted')}
				aria-current={active === 'deleted' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else if section === 'About'}
			<a
				class="row"
				href={resolve('/settings/about')}
				aria-current={active === 'about' ? 'page' : undefined}
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
		{:else if section === 'Privacy'}
			<a
				class="row"
				href={resolve('/settings/privacy')}
				aria-current={active === 'privacy' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else if section === 'Cloud and devices'}
			<a
				class="row"
				href={resolve('/settings/cloud')}
				aria-current={active === 'cloud' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{:else if section === 'Reminders'}
			<a
				class="row"
				href={resolve('/settings/reminders')}
				aria-current={active === 'reminders' ? 'page' : undefined}
			>
				<span>{section}</span><ChevronRight aria-hidden="true" />
			</a>
		{/if}
	{/each}
</nav>

<style>
	h1 {
		margin: 0 0 var(--ht-space-5);
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	header {
		max-width: var(--ht-content-max);
	}

	@media (width >= 1024px) {
		h1 {
			max-width: var(--ht-content-max);
		}
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

	a:focus-visible {
		outline: var(--ht-focus-width) solid var(--ht-ink);
		outline-offset: var(--ht-focus-offset);
	}
</style>
