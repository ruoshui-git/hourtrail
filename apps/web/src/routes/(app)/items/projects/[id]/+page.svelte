<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { ChevronLeft, Plus } from '@lucide/svelte';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import {
		Button,
		ConfirmDialog,
		Field,
		Select,
		Sheet,
		TextInput,
		WorkItemRow,
	} from '$lib/components';
	import { showToast } from '$lib/components/toasts.svelte';
	import { canDeleteProject, validateProjectName } from '$lib/features/projects/domain';
	import type { RecordOf } from '@hourtrail/core';
	import { WORK_TYPE_ID } from '@hourtrail/core';

	const id = $derived(page.params.id ?? '');
	const initial = {
		project: undefined as RecordOf<'project'> | undefined,
		items: [] as RecordOf<'work_item'>[],
		projects: [] as RecordOf<'project'>[],
		types: [] as RecordOf<'activity_type'>[],
	};
	const data = live(async () => {
		const [project, items, projects, types] = await Promise.all([
			db.project.get(id),
			db.work_item.toArray(),
			db.project.toArray(),
			db.activity_type.toArray(),
		]);
		return {
			project: project?.deleted_at === null ? project : undefined,
			items: items.filter((item) => item.deleted_at === null),
			projects: projects.filter((project) => project.deleted_at === null),
			types: types.filter((type) => type.deleted_at === null),
		};
	}, initial);
	let snapshot = $state(initial);
	let renameOpen = $state(false);
	let renameValue = $state('');
	let renameError = $state('');
	let archiveOpen = $state(false);
	let deleteOpen = $state(false);
	let moveOpen = $state(false);
	let addOpen = $state(false);
	let movingItem = $state<RecordOf<'work_item'> | null>(null);
	let moveTarget = $state('');
	let selectedItems = $state<string[]>([]);
	$effect(() => {
		if (data.current.project || data.current.items.length) snapshot = data.current;
	});
	onMount(async () => {
		await repo.ensureSeeded();
	});
	const attached = $derived(snapshot.items.filter((item) => item.project_id === id));
	const activeItems = $derived(
		attached
			.filter((item) => item.archived_at === null)
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
	const archivedItems = $derived(
		attached
			.filter((item) => item.archived_at !== null)
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
	const availableItems = $derived(
		snapshot.items
			.filter((item) => item.project_id !== id)
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
	const deletable = $derived(canDeleteProject(id, snapshot.items));
	function typeFor(typeId: string) {
		return (
			snapshot.types.find((type) => type.id === typeId) ??
			snapshot.types.find((type) => type.id === WORK_TYPE_ID)
		);
	}
	function openRename() {
		renameValue = snapshot.project?.name ?? '';
		renameError = '';
		renameOpen = true;
	}
	async function rename() {
		const project = snapshot.project;
		if (!project) return;
		const result = validateProjectName(renameValue, snapshot.projects, id);
		if (!result.ok) {
			renameError = result.error;
			return;
		}
		await repo.update('project', id, { name: result.name });
		renameOpen = false;
		showToast({ message: 'Project renamed.' });
	}
	async function archive() {
		const project = snapshot.project;
		if (!project) return;
		const wasArchived = project.archived_at !== null;
		await repo.update('project', id, { archived_at: wasArchived ? null : Date.now() });
		showToast({ message: wasArchived ? 'Project unarchived.' : 'Project archived.' });
	}
	async function remove() {
		if (!deletable) return;
		const undo = await repo.remove('project', id);
		showToast({ message: 'Project deleted.', undo: () => repo.undo(undo) });
		await goto(resolve('/items/projects'));
	}
	function openMove(item: RecordOf<'work_item'>) {
		movingItem = item;
		moveTarget = item.project_id ?? '';
		moveOpen = true;
	}
	async function moveOne() {
		if (!movingItem) return;
		await repo.update('work_item', movingItem.id, { project_id: moveTarget || null });
		moveOpen = false;
		showToast({ message: 'Work item moved.' });
	}
	function toggleItem(itemId: string) {
		selectedItems = selectedItems.includes(itemId)
			? selectedItems.filter((value) => value !== itemId)
			: [...selectedItems, itemId];
	}
	async function addSelected() {
		const count = selectedItems.length;
		for (const itemId of selectedItems) await repo.update('work_item', itemId, { project_id: id });
		addOpen = false;
		selectedItems = [];
		showToast({ message: count === 1 ? '1 work item added.' : `${count} work items added.` });
	}
	async function startItem(item: RecordOf<'work_item'>) {
		const running = (await repo.running())[0];
		const result = running
			? await repo.switchTo({ workItemId: item.id })
			: await repo.start({ workItemId: item.id });
		showToast({ message: `Started ${item.name}.`, undo: () => repo.undo(result.undo) });
	}
</script>

<svelte:head><title>{snapshot.project?.name ?? 'Project'} · Hourtrail</title></svelte:head>
{#if snapshot.project}
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/items/projects'))}
		>Projects</Button
	>
	<header class="heading">
		<div>
			<h1>{snapshot.project.name}</h1>
			{#if snapshot.project.archived_at}<p>Archived</p>{/if}
		</div>
		<Button variant="secondary" onclick={openRename}>Rename</Button>
	</header>
	<div class="actions">
		<Button variant="secondary" onclick={() => (archiveOpen = true)}
			>{snapshot.project.archived_at ? 'Unarchive' : 'Archive'}</Button
		><Button variant="danger" disabled={!deletable} onclick={() => (deleteOpen = true)}
			>Delete</Button
		>
	</div>
	{#if !deletable}<p id="delete-hint" class="hint">
			Move its work items to another project first, or archive the project instead.
		</p>{/if}
	<section>
		<div class="section-heading">
			<h2>Work items</h2>
			<Button
				variant="secondary"
				icon={Plus}
				onclick={() => {
					selectedItems = [];
					addOpen = true;
				}}>Add items</Button
			>
		</div>
		{#each activeItems as item (item.id)}{@const type = typeFor(item.type_id)}{#if type}<div
					class="item-row"
				>
					<WorkItemRow
						name={item.name}
						typeName={type.name}
						typeColor={type.color}
						onstart={() => startItem(item)}
						onopen={() => goto(resolve(`/items/${item.id}`))}
					/>
					<div class="move-action">
						<Button variant="quiet" onclick={() => openMove(item)}>Move to…</Button>
					</div>
				</div>{/if}{/each}
		{#if archivedItems.length}<h3>Archived</h3>
			{#each archivedItems as item (item.id)}{@const type = typeFor(item.type_id)}{#if type}<div
						class="item-row"
					>
						<WorkItemRow
							name={item.name}
							typeName={type.name}
							typeColor={type.color}
							onstart={() => startItem(item)}
							onopen={() => goto(resolve(`/items/${item.id}`))}
						/>
						<div class="move-action">
							<Button variant="quiet" onclick={() => openMove(item)}>Move to…</Button>
						</div>
					</div>{/if}{/each}{/if}
		{#if attached.length === 0}<p>
				No work items in this project yet. Add items to group them here.
			</p>{/if}
	</section>
{:else}<h1>Project not found</h1>
	<Button onclick={() => goto(resolve('/items/projects'))}>Projects</Button>{/if}

<Sheet bind:open={renameOpen} title="Rename project">
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void rename();
		}}
	>
		<Field label="Name" error={renameError}
			>{#snippet children({ id, describedBy, invalid })}<TextInput
					{id}
					bind:value={renameValue}
					{describedBy}
					{invalid}
				/>{/snippet}</Field
		><Button type="submit" wide>Save name</Button>
	</form>
</Sheet>
<Sheet bind:open={moveOpen} title="Move work item" description={movingItem?.name}>
	<Field label="Move to"
		>{#snippet children({ id: fieldId })}<Select
				id={fieldId}
				bind:value={moveTarget}
				options={[
					{ value: '', label: 'No project' },
					...snapshot.projects
						.filter((project) => project.archived_at === null)
						.map((project) => ({ value: project.id, label: project.name })),
				]}
			/>{/snippet}</Field
	>
	<Button wide onclick={moveOne}>Move work item</Button>
</Sheet>
<Sheet
	bind:open={addOpen}
	title="Add items"
	description="Choose work items to move into this project."
>
	{#if availableItems.length === 0}<p>All work items are already in this project.</p>{:else}<div
			class="check-list"
		>
			{#each availableItems as item (item.id)}<label
					><input
						type="checkbox"
						checked={selectedItems.includes(item.id)}
						onchange={() => toggleItem(item.id)}
					/>{item.name}{#if item.archived_at}<span>Archived</span>{/if}</label
				>{/each}
		</div>{/if}
	<Button wide disabled={selectedItems.length === 0} onclick={addSelected}
		>Add selected items</Button
	>
</Sheet>
<ConfirmDialog
	bind:open={archiveOpen}
	title={snapshot.project?.archived_at
		? 'Unarchive project?'
		: `Archive ${snapshot.project?.name ?? 'project'}?`}
	message={snapshot.project?.archived_at
		? 'The project will be available with active projects again.'
		: 'Its items keep their history and stay usable.'}
	confirmLabel={snapshot.project?.archived_at ? 'Unarchive project' : 'Archive project'}
	onconfirm={archive}
/>
<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete project?"
	message="This project will be deleted. You can undo this from the toast."
	confirmLabel="Delete project"
	danger
	onconfirm={remove}
/>

<style>
	.heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--ht-space-4);
		max-width: var(--ht-content-max);
		margin-block: var(--ht-space-4) var(--ht-space-5);
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
		overflow-wrap: anywhere;
	}

	h2 {
		margin: 0;
		font: var(--ht-type-heading);
	}

	h3 {
		margin: var(--ht-space-5) 0 var(--ht-space-2);
		font: var(--ht-type-heading);
	}

	.heading p,
	.hint {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.actions,
	.section-heading {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
	}

	section {
		max-width: var(--ht-content-max);
		margin-block: var(--ht-space-5);
	}

	.section-heading {
		justify-content: space-between;
		margin-bottom: var(--ht-space-3);
	}

	.item-row {
		display: grid;
		border-bottom: var(--ht-hairline) solid var(--ht-line);
	}

	.move-action {
		margin-inline-start: calc(var(--ht-space-3) + var(--ht-icon) + var(--ht-space-3));
		margin-bottom: var(--ht-space-1);
	}

	.check-list {
		display: grid;
		gap: var(--ht-space-2);
	}

	.check-list label {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		font: var(--ht-type-body);
		overflow-wrap: anywhere;
	}

	.check-list input {
		width: var(--ht-space-4);
		height: var(--ht-space-4);
		accent-color: var(--ht-ink);
	}

	.check-list span {
		margin-left: auto;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	form {
		display: grid;
		gap: var(--ht-space-4);
	}
</style>
