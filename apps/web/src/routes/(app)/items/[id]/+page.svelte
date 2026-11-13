<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';
	import { sessionMinutes } from '@hourtrail/core';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import {
		Button,
		ConfirmDialog,
		Field,
		Select,
		Switch,
		TextArea,
		TextInput,
	} from '$lib/components';
	import { showToast } from '$lib/components/toasts.svelte';
	import { formatMinutes } from '$lib/format';
	import { WORK_TYPE_ID } from '@hourtrail/core';
	let now = $state(Date.now());
	const timer = setInterval(() => (now = Date.now()), 30_000);
	onDestroy(() => clearInterval(timer));
	const id = $derived(page.params.id ?? '');
	const data = live(
		async () => {
			const [item, types, projects, sessions] = await Promise.all([
				db.work_item.get(id),
				db.activity_type.toArray(),
				db.project.toArray(),
				db.session.where('work_item_id').equals(id).toArray(),
			]);
			return {
				item,
				types: types.filter((x) => !x.deleted_at && !x.archived_at),
				projects: projects.filter((x) => !x.deleted_at && !x.archived_at),
				sessions: sessions.filter((x) => !x.deleted_at).sort((a, b) => b.start_at - a.start_at),
			};
		},
		{ item: undefined, types: [], projects: [], sessions: [] },
	);
	let name = $state('');
	let description = $state('');
	let typeId = $state(WORK_TYPE_ID);
	let projectId = $state('');
	let pinned = $state(false);
	let initialized = $state(false);
	let saved = $state(false);
	let confirmDelete = $state(false);
	$effect(() => {
		const item = data.current.item;
		if (item && !initialized) {
			name = item.name;
			description = item.description;
			typeId = item.type_id;
			projectId = item.project_id ?? '';
			pinned = item.pinned_at !== null;
			initialized = true;
		}
	});
	const total = $derived(
		data.current.sessions.reduce((n, s) => n + sessionMinutes(s.start_at, s.end_at ?? now), 0),
	);
	async function save() {
		const item = data.current.item;
		if (!item || !name.trim()) return;
		await repo.update('work_item', item.id, {
			name: name.trim(),
			description,
			type_id: typeId,
			project_id: projectId || null,
			pinned_at: pinned ? (item.pinned_at ?? Date.now()) : null,
			pin_sort: pinned ? item.pin_sort : 0,
		});
		saved = true;
		showToast({ message: 'Saved' });
		setTimeout(() => (saved = false), 1800);
	}
	async function archive() {
		const item = data.current.item;
		if (!item) return;
		const archived = item.archived_at === null;
		await repo.update('work_item', item.id, { archived_at: archived ? Date.now() : null });
		showToast({
			message: archived ? 'Work item archived' : 'Work item restored',
			undo: () =>
				repo
					.update('work_item', item.id, { archived_at: archived ? null : Date.now() })
					.then(() => undefined),
		});
	}
	function fieldBlur() {
		void save();
	}
	async function remove() {
		const item = data.current.item;
		if (!item) return;
		const undo = await repo.remove('work_item', item.id);
		showToast({ message: 'Work item deleted', undo: () => repo.undo(undo) });
		await goto(resolve('/items'));
	}
	function dateOnly(ms: number) {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(ms);
	}
</script>

<svelte:head><title>{data.current.item?.name ?? 'Work item'} · Hourtrail</title></svelte:head>
{#if data.current.item}
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/items'))}>Items</Button>
	<header>
		<h1>{data.current.item.name}</h1>
		{#if saved}<p role="status">Saved</p>{/if}
	</header>
	<div class="fields" onfocusout={fieldBlur} onchange={fieldBlur}>
		<Field label="Name"
			>{#snippet children({ id })}<TextInput {id} bind:value={name} />{/snippet}</Field
		>
		<Field label="Description"
			>{#snippet children({ id })}<TextArea {id} bind:value={description} />{/snippet}</Field
		>
		<Field label="Activity type"
			>{#snippet children({ id })}<Select
					{id}
					bind:value={typeId}
					options={data.current.types.map((x) => ({ value: x.id, label: x.name }))}
				/>{/snippet}</Field
		>
		<Field label="Project"
			>{#snippet children({ id })}<Select
					{id}
					bind:value={projectId}
					options={[
						{ value: '', label: 'No project' },
						...data.current.projects.map((x) => ({ value: x.id, label: x.name })),
					]}
				/>{/snippet}</Field
		>
		<Switch label="Pinned" bind:checked={pinned} />
	</div>
	<section>
		<h2>Total time</h2>
		<p>
			{formatMinutes(total)} across {data.current.sessions.length}
			{data.current.sessions.length === 1 ? 'session' : 'sessions'}
		</p>
	</section>
	<section>
		<h2>Sessions</h2>
		{#each data.current.sessions as session (session.id)}<article>
				<strong>{dateOnly(session.start_at)}</strong><span
					>{new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(
						session.start_at,
					)}–{session.end_at === null
						? 'Running'
						: new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(
								session.end_at,
							)}</span
				><span>{formatMinutes(sessionMinutes(session.start_at, session.end_at ?? now))}</span
				>{#if session.note}<p>{session.note.split('\n')[0]}</p>{/if}
			</article>{:else}<p>No sessions yet.</p>{/each}
	</section>
	<footer>
		<Button variant="secondary" onclick={archive}
			>{data.current.item.archived_at ? 'Restore' : 'Archive'}</Button
		>{#if data.current.sessions.length === 0}<Button
				variant="danger"
				onclick={() => (confirmDelete = true)}>Delete</Button
			>{/if}
	</footer>
	<ConfirmDialog
		bind:open={confirmDelete}
		title="Delete work item?"
		message="This work item has no sessions and will be deleted."
		confirmLabel="Delete"
		danger
		onconfirm={remove}
	/>
{:else}<h1>Work item not found</h1>
	<Button onclick={() => goto(resolve('/items'))}>Items</Button>{/if}

<style>
	h1 {
		margin: 0;
		font: var(--ht-type-title);
		overflow-wrap: anywhere;
	}

	h2 {
		font: var(--ht-type-heading);
		margin-bottom: var(--ht-space-2);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
	}

	header p {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.fields {
		display: grid;
		gap: var(--ht-space-4);
		max-width: var(--ht-content-narrow);
		margin-block: var(--ht-space-5);
	}

	section {
		max-width: var(--ht-content-max);
		margin-block: var(--ht-space-6);
	}

	section > p {
		max-width: var(--ht-measure);
		font: var(--ht-type-body);
	}

	article {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--ht-space-1) var(--ht-space-3);
		min-height: var(--ht-target);
		padding-block: var(--ht-space-3);
		border-bottom: var(--ht-hairline) solid var(--ht-line);
	}

	article strong,
	article span {
		font: var(--ht-type-body);
	}

	article p {
		grid-column: 1/-1;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	footer {
		display: flex;
		gap: var(--ht-space-3);
	}
</style>
