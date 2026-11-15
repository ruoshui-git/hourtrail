<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { Plus } from '@lucide/svelte';
	import { readSetting } from '@hourtrail/core';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { Button, EmptyState, Field, Sheet, TextInput } from '$lib/components';
	import { showToast } from '$lib/components/toasts.svelte';
	import { formatMinutes } from '$lib/format';
	import {
		projectItemCount,
		projectMonthMinutes,
		validateProjectName,
	} from '$lib/features/projects/domain';
	import type { RecordOf } from '@hourtrail/core';

	const initial = {
		projects: [] as RecordOf<'project'>[],
		items: [] as RecordOf<'work_item'>[],
		sessions: [] as RecordOf<'session'>[],
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	};
	async function loadData() {
		const [projects, items, sessions, setting] = await Promise.all([
			db.project.toArray(),
			db.work_item.toArray(),
			db.session.toArray(),
			db.setting.get('reporting_tz'),
		]);
		return {
			projects: projects.filter((row) => row.deleted_at === null),
			items: items.filter((row) => row.deleted_at === null),
			sessions,
			zone:
				readSetting('reporting_tz', setting?.value) ??
				Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	}
	const data = live(loadData, initial);
	let snapshot = $state(initial);
	let sheetOpen = $state(false);
	let name = $state('');
	let error = $state('');
	$effect(() => {
		if (data.current.projects.length || data.current.items.length) snapshot = data.current;
	});
	onMount(async () => {
		snapshot = await loadData();
	});
	const activeProjects = $derived(
		snapshot.projects
			.filter((row) => row.archived_at === null)
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
	const archivedProjects = $derived(
		snapshot.projects
			.filter((row) => row.archived_at !== null)
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
	function stats(projectId: string | null) {
		return {
			count: projectItemCount(projectId, snapshot.items),
			minutes: projectMonthMinutes(
				projectId,
				snapshot.items,
				snapshot.sessions,
				snapshot.zone,
				Date.now(),
			),
		};
	}
	async function create() {
		const validation = validateProjectName(name, snapshot.projects);
		if (!validation.ok) {
			error = validation.error;
			return;
		}
		await repo.create('project', { name: validation.name, archived_at: null });
		snapshot = await loadData();
		name = '';
		error = '';
		sheetOpen = false;
		showToast({ message: 'Project added.' });
	}
</script>

<svelte:head><title>Projects · Hourtrail</title></svelte:head>
<header class="heading">
	<div>
		<h1>Projects</h1>
		<p>Group work items and see their time together.</p>
	</div>
	<Button icon={Plus} onclick={() => (sheetOpen = true)}>New project</Button>
</header>
{#if snapshot.projects.length === 0}
	<EmptyState
		message="No projects yet. Group work items into projects to see their totals together."
		actionLabel="New project"
		onaction={() => (sheetOpen = true)}
	/>
{:else}
	<section aria-label="Active projects">
		{#each activeProjects as project (project.id)}
			{@const total = stats(project.id)}
			<button class="project-row" onclick={() => goto(resolve(`/items/projects/${project.id}`))}>
				<strong>{project.name}</strong><span
					>{total.count}
					{total.count === 1 ? 'item' : 'items'} · {formatMinutes(total.minutes)} this month</span
				>
			</button>
		{/each}
	</section>
	{@const unassigned = stats(null)}
	{#if unassigned.count > 0}
		<section>
			<div class="project-row no-project">
				<strong>No project</strong><span>
					{unassigned.count}
					{unassigned.count === 1 ? 'item' : 'items'} · {formatMinutes(unassigned.minutes)} this month
				</span>
			</div>
		</section>
	{/if}
	{#if archivedProjects.length > 0}
		<section>
			<h2>Archived</h2>
			{#each archivedProjects as project (project.id)}
				{@const total = stats(project.id)}
				<button class="project-row" onclick={() => goto(resolve(`/items/projects/${project.id}`))}>
					<strong>{project.name}</strong><span
						>{total.count}
						{total.count === 1 ? 'item' : 'items'} · {formatMinutes(total.minutes)} this month</span
					>
				</button>
			{/each}
		</section>
	{/if}
{/if}
<Sheet bind:open={sheetOpen} title="New project" onclose={() => (error = '')}>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void create();
		}}
	>
		<Field label="Name" {error}
			>{#snippet children({ id, describedBy, invalid })}<TextInput
					{id}
					bind:value={name}
					{describedBy}
					{invalid}
				/>{/snippet}</Field
		>
		<Button type="submit" wide>Create project</Button>
	</form>
</Sheet>

<style>
	.heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--ht-space-4);
		max-width: var(--ht-content-max);
		margin-bottom: var(--ht-space-5);
	}

	.heading > :last-child {
		margin-left: auto;
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
	}

	h2 {
		font: var(--ht-type-heading);
		margin: 0 0 var(--ht-space-2);
	}

	.heading p {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	section {
		max-width: var(--ht-content-max);
		margin-block: var(--ht-space-5);
	}

	.project-row {
		display: grid;
		gap: var(--ht-space-1);
		width: 100%;
		min-height: var(--ht-target);
		padding: var(--ht-space-3);
		border: 0;
		border-bottom: var(--ht-hairline) solid var(--ht-line);
		background: transparent;
		color: var(--ht-ink);
		text-align: left;
	}

	.project-row strong {
		font: var(--ht-type-body-strong);
		overflow-wrap: anywhere;
	}

	.project-row span {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.project-row:hover {
		background: var(--ht-hover);
	}

	form {
		display: grid;
		gap: var(--ht-space-4);
	}
</style>
