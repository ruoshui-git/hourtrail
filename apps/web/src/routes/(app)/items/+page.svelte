<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { Plus, Archive, Pencil } from '@lucide/svelte';
	import { WORK_TYPE_ID } from '@hourtrail/core';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import {
		WorkItemRow,
		TextInput,
		Button,
		EmptyState,
		Sheet,
		Field,
		Select,
		TextArea,
		Menu,
		ConfirmDialog,
	} from '$lib/components';
	import { showToast } from '$lib/components/toasts.svelte';
	import type { RecordOf } from '@hourtrail/core';
	let search = $state('');
	let adding = $state(false);
	let name = $state('');
	let description = $state('');
	let typeId = $state(WORK_TYPE_ID);
	let projectId = $state('');
	let projectName = $state('');
	let archivedOpen = $state(false);
	let projectEdit = $state<RecordOf<'project'> | null>(null);
	let confirmProject = $state(false);
	const initial = {
		items: [] as RecordOf<'work_item'>[],
		projects: [] as RecordOf<'project'>[],
		types: [] as RecordOf<'activity_type'>[],
		sessions: [] as RecordOf<'session'>[],
	};
	async function loadData() {
		await repo.ensureSeeded();
		const [items, projects, types, sessions] = await Promise.all([
			db.work_item.toArray(),
			db.project.toArray(),
			db.activity_type.toArray(),
			db.session.toArray(),
		]);
		return {
			items: items.filter((x) => !x.deleted_at),
			projects: projects.filter((x) => !x.deleted_at),
			types: types.filter((x) => !x.deleted_at && !x.archived_at),
			sessions: sessions.filter((x) => !x.deleted_at),
		};
	}
	const data = live(loadData, initial);
	const outbox = live(() => db.outbox.toArray(), []);
	const pendingIds = $derived(new Set(outbox.current.map((row) => row.mutation.record_id)));
	let snapshot = $state(initial);
	$effect(() => {
		if (data.current.items.length || data.current.projects.length) snapshot = data.current;
	});
	onMount(async () => {
		snapshot = await loadData();
	});
	const needle = $derived(search.toLocaleLowerCase());
	const visible = $derived(
		snapshot.items.filter((x) => `${x.name} ${x.description}`.toLocaleLowerCase().includes(needle)),
	);
	const pinned = $derived(
		visible
			.filter((x) => !x.archived_at && x.pinned_at !== null)
			.sort((a, b) => a.pin_sort - b.pin_sort),
	);
	const active = $derived(visible.filter((x) => !x.archived_at && x.pinned_at === null));
	const archived = $derived(visible.filter((x) => x.archived_at));
	function typeFor(id: string) {
		return snapshot.types.find((x) => x.id === id) ?? snapshot.types[0];
	}
	function projectFor(id: string | null) {
		return snapshot.projects.find((x) => x.id === id);
	}
	function itemsFor(project: string | null) {
		return active.filter((x) => x.project_id === project);
	}
	async function add() {
		if (!name.trim()) return;
		let project = projectId || null;
		if (projectId === '__new__' && projectName.trim())
			project = (await repo.create('project', { name: projectName.trim(), archived_at: null })).id;
		await repo.create('work_item', {
			name: name.trim(),
			description,
			type_id: typeId,
			project_id: project,
			place_id: null,
			pinned_at: null,
			pin_sort: 0,
			archived_at: null,
		});
		snapshot = await loadData();
		name = '';
		description = '';
		projectName = '';
		projectId = '';
		adding = false;
		showToast({ message: 'Work item added' });
	}
	async function startItem(item: RecordOf<'work_item'>) {
		const running = (await repo.running())[0];
		const result = running
			? await repo.switchTo({ workItemId: item.id })
			: await repo.start({ workItemId: item.id });
		showToast({ message: `Started ${item.name}`, undo: () => repo.undo(result.undo) });
	}
	async function projectAction(label: string) {
		if (!projectEdit) return;
		const project = projectEdit;
		if (label === 'Rename') {
			const next = prompt('Project name', project.name);
			if (next?.trim()) await repo.update('project', project.id, { name: next.trim() });
		} else {
			await repo.update('project', project.id, { archived_at: Date.now() });
		}
		projectEdit = null;
	}
</script>

<svelte:head><title>Items · Hourtrail</title></svelte:head>
<header class="heading">
	<div>
		<h1>Items</h1>
		<p>Reusable activities and projects</p>
	</div>
	<Button icon={Plus} onclick={() => (adding = true)}>Add work item</Button>
</header>
<div class="search">
	<Field label="Search work items"
		>{#snippet children({ id })}<TextInput
				{id}
				bind:value={search}
				placeholder="Search work items"
			/>{/snippet}</Field
	>
</div>
{#if snapshot.items.length === 0}
	<EmptyState
		message="No work items yet. Add work item"
		actionLabel="Add work item"
		onaction={() => (adding = true)}
	/>
{:else}
	{#if pinned.length}<section>
			<h2>Pinned</h2>
			{#each pinned as item (item.id)}{@const type = typeFor(item.type_id)}{#if type}<div
						class="pending-row"
					>
						<WorkItemRow
							name={item.name}
							typeName={type.name}
							typeColor={type.color}
							projectName={projectFor(item.project_id)?.name}
							pinned
							onstart={() => startItem(item)}
							onopen={() => goto(resolve(`/items/${item.id}`))}
						/>{#if pendingIds.has(item.id)}<span
								class="pending-dot"
								role="img"
								aria-label="Not backed up yet"
							></span>{/if}
					</div>{/if}{/each}
		</section>{/if}
	{#each snapshot.projects.filter((p) => p.archived_at === null) as project (project.id)}
		{@const rows = itemsFor(project.id)}{#if rows.length}<section>
				<div class="section-title">
					<h2>{project.name}</h2>
					<Menu
						label={`Options for ${project.name}`}
						items={[
							{
								label: 'Rename',
								icon: Pencil,
								onselect: () => {
									projectEdit = project;
								},
							},
							{
								label: 'Archive project',
								icon: Archive,
								onselect: () => {
									projectEdit = project;
									confirmProject = true;
								},
							},
						]}
					/>
				</div>
				{#each rows as item (item.id)}{@const type = typeFor(item.type_id)}{#if type}<div
							class="pending-row"
						>
							<WorkItemRow
								name={item.name}
								typeName={type.name}
								typeColor={type.color}
								projectName={project.name}
								onstart={() => startItem(item)}
								onopen={() => goto(resolve(`/items/${item.id}`))}
							/>{#if pendingIds.has(item.id)}<span
									class="pending-dot"
									role="img"
									aria-label="Not backed up yet"
								></span>{/if}
						</div>{/if}{/each}
			</section>{/if}
	{/each}
	{@const noProject = itemsFor(null)}{#if noProject.length}<section>
			<h2>No project</h2>
			{#each noProject as item (item.id)}{@const type = typeFor(item.type_id)}{#if type}<div
						class="pending-row"
					>
						<WorkItemRow
							name={item.name}
							typeName={type.name}
							typeColor={type.color}
							onstart={() => startItem(item)}
							onopen={() => goto(resolve(`/items/${item.id}`))}
						/>{#if pendingIds.has(item.id)}<span
								class="pending-dot"
								role="img"
								aria-label="Not backed up yet"
							></span>{/if}
					</div>{/if}{/each}
		</section>{/if}
	<section>
		<button
			class="disclosure"
			onclick={() => (archivedOpen = !archivedOpen)}
			aria-expanded={archivedOpen}>Archived ({archived.length})</button
		>{#if archivedOpen}{#each archived as item (item.id)}{@const type = typeFor(
					item.type_id,
				)}{#if type}<div class="pending-row">
						<WorkItemRow
							name={item.name}
							typeName={type.name}
							typeColor={type.color}
							projectName={projectFor(item.project_id)?.name}
							onstart={() => startItem(item)}
							onopen={() => goto(resolve(`/items/${item.id}`))}
						/>{#if pendingIds.has(item.id)}<span
								class="pending-dot"
								role="img"
								aria-label="Not backed up yet"
							></span>{/if}
					</div>{/if}{/each}{#if archived.length === 0}<p>No archived work items.</p>{/if}{/if}
	</section>
{/if}
<Sheet bind:open={adding} title="Add work item" onclose={() => (adding = false)}
	><form
		onsubmit={(e) => {
			e.preventDefault();
			void add();
		}}
	>
		<Field label="Name"
			>{#snippet children({ id })}<TextInput {id} bind:value={name} />{/snippet}</Field
		><Field label="Description"
			>{#snippet children({ id })}<TextArea {id} bind:value={description} />{/snippet}</Field
		><Field label="Activity type"
			>{#snippet children({ id })}<Select
					{id}
					bind:value={typeId}
					options={snapshot.types.map((x) => ({ value: x.id, label: x.name }))}
				/>{/snippet}</Field
		><Field label="Project"
			>{#snippet children({ id })}<Select
					{id}
					bind:value={projectId}
					options={[
						{ value: '', label: 'No project' },
						...snapshot.projects
							.filter((x) => !x.archived_at)
							.map((x) => ({ value: x.id, label: x.name })),
						{ value: '__new__', label: 'New project…' },
					]}
				/>{/snippet}</Field
		>{#if projectId === '__new__'}<Field label="New project name"
				>{#snippet children({ id })}<TextInput {id} bind:value={projectName} />{/snippet}</Field
			>{/if}<Button type="submit" wide>Add work item</Button>
	</form></Sheet
>
<ConfirmDialog
	bind:open={confirmProject}
	title="Archive project?"
	message="Items remain available under this project."
	confirmLabel="Archive project"
	onconfirm={() => projectAction('Archive')}
/>

<style>
	.heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--ht-space-4);
		max-width: var(--ht-content-max);
		margin-bottom: var(--ht-space-5);
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
	}

	h2 {
		font: var(--ht-type-heading);
		margin: 0;
	}

	.heading p {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	section {
		max-width: var(--ht-content-max);
		margin-block: var(--ht-space-5);
	}

	.pending-row {
		position: relative;
	}

	.pending-dot {
		position: absolute;
		top: 50%;
		right: calc(2 * var(--ht-target) + var(--ht-space-1) + var(--ht-space-3));
		width: var(--ht-space-2);
		height: var(--ht-space-2);
		transform: translateY(-50%);
		border: var(--ht-hairline) solid var(--ht-ink-2);
		border-radius: var(--ht-radius-chip);
		pointer-events: none;
	}

	.search {
		max-width: var(--ht-content-narrow);
		margin-bottom: var(--ht-space-5);
	}

	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.disclosure {
		min-height: var(--ht-target);
		padding: var(--ht-space-2) 0;
		border: 0;
		background: none;
		color: var(--ht-ink);
		font: var(--ht-type-heading);
		text-align: left;
	}

	form {
		display: grid;
		gap: var(--ht-space-4);
	}
</style>
