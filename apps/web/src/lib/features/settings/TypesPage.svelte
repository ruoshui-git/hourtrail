<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { BLAZE_KEYS } from '@hourtrail/core';
	import { patchMutation } from '@hourtrail/core';
	import type { BlazeKey, RecordOf } from '@hourtrail/core';
	import { ChevronLeft } from '@lucide/svelte';
	import {
		Blaze,
		Button,
		Field,
		Menu,
		Sheet,
		Switch,
		TextInput,
		TypeTag,
		showToast,
	} from '$lib/components';
	import { db, repo } from '$lib/db/app';
	import type { UndoToken } from '$lib/db/repo';
	type ActivityType = RecordOf<'activity_type'>;
	const names: Record<BlazeKey, string> = {
		lake: 'Lake',
		saffron: 'Saffron',
		fern: 'Fern',
		rowan: 'Rowan',
		heather: 'Heather',
		spruce: 'Spruce',
		rose: 'Rose',
		lichen: 'Lichen',
		slate: 'Slate',
		bark: 'Bark',
	};
	let rows = $state<ActivityType[]>([]);
	let archivedOpen = $state(false);
	let sheetOpen = $state(false);
	let editing = $state<ActivityType | null>(null);
	let name = $state('');
	let color = $state<BlazeKey>('lake');
	let countsAsWork = $state(true);
	let remind = $state(false);
	let busy = $state(false);
	let error = $state('');
	let active = $derived(
		rows
			.filter((type) => type.deleted_at === null && type.archived_at === null)
			.sort((a, b) => a.sort_key - b.sort_key),
	);
	let archived = $derived(
		rows
			.filter((type) => type.deleted_at === null && type.archived_at !== null)
			.sort((a, b) => a.sort_key - b.sort_key),
	);

	async function refresh() {
		await repo.ensureSeeded();
		rows = await db.activity_type.toArray();
	}
	onMount(() => {
		void refresh();
	});

	function openAdd() {
		editing = null;
		name = '';
		color = 'lake';
		countsAsWork = true;
		remind = false;
		error = '';
		sheetOpen = true;
	}
	function openEdit(type: ActivityType) {
		editing = type;
		name = type.name;
		color = type.color;
		countsAsWork = type.counts_as_work;
		remind = type.remind;
		error = '';
		sheetOpen = true;
	}
	async function save() {
		const cleanName = name.trim();
		if (!cleanName) {
			error = 'Enter a name for this activity type.';
			return;
		}
		busy = true;
		try {
			if (editing)
				await repo.update('activity_type', editing.id, {
					name: cleanName,
					color,
					counts_as_work: countsAsWork,
					remind,
				});
			else
				await repo.create('activity_type', {
					name: cleanName,
					color,
					counts_as_work: countsAsWork,
					remind,
					sort_key: active.length ? Math.max(...active.map((type) => type.sort_key)) + 1 : 1,
					archived_at: null,
				});
			await refresh();
			sheetOpen = false;
		} catch {
			error = 'Could not save this activity type. Try again.';
		} finally {
			busy = false;
		}
	}
	async function reorder(type: ActivityType, direction: -1 | 1) {
		const index = active.findIndex((item) => item.id === type.id);
		const position = index + direction;
		if (position < 0 || position >= active.length) return;
		const remaining = active.filter((item) => item.id !== type.id);
		const previous = remaining[position - 1];
		const next = remaining[position];
		const key =
			previous && next
				? (previous.sort_key + next.sort_key) / 2
				: previous
					? previous.sort_key + 1
					: next!.sort_key - 1;
		await repo.update('activity_type', type.id, { sort_key: key });
		await refresh();
	}
	async function archive(type: ActivityType) {
		const before = (await db.activity_type.get(type.id))!;
		const archivedAt = Date.now();
		await repo.update('activity_type', type.id, { archived_at: archivedAt });
		const mutation = patchMutation(
			'activity_type',
			before,
			{ archived_at: archivedAt },
			{ now: archivedAt, deviceId: await repo.deviceId() },
		)!;
		const undo: UndoToken = { label: 'Archive', mutations: [mutation], before: [before] };
		await refresh();
		showToast({
			message: 'Activity type archived.',
			undo: async () => {
				await repo.undo(undo);
				await refresh();
			},
		});
	}
	async function restore(type: ActivityType) {
		await repo.restore('activity_type', type.id);
		await repo.update('activity_type', type.id, { archived_at: null });
		await refresh();
	}
</script>

<svelte:head><title>Activity types · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Activity types</h1>
	<Button onclick={openAdd}>Add activity type</Button>
</header>
<ul aria-label="Activity types">
	{#each active as type (type.id)}
		<li>
			<div class="identity">
				<TypeTag name={type.name} color={type.color} /><span class="meaning"
					>{type.counts_as_work ? 'Counts as work' : 'Separate'}</span
				>
			</div>
			<Menu
				label={'Options for ' + type.name}
				items={[
					{ label: 'Rename', onselect: () => openEdit(type) },
					{ label: 'Change colour', onselect: () => openEdit(type) },
					{
						label: 'Move up',
						disabled: active[0]?.id === type.id,
						onselect: () => reorder(type, -1),
					},
					{
						label: 'Move down',
						disabled: active.at(-1)?.id === type.id,
						onselect: () => reorder(type, 1),
					},
					{ label: 'Archive', onselect: () => archive(type) },
				]}
			/>
		</li>
	{/each}
</ul>
{#if archived.length}
	<button
		class="disclosure"
		aria-expanded={archivedOpen}
		onclick={() => (archivedOpen = !archivedOpen)}>Archived ({archived.length})</button
	>
	{#if archivedOpen}<ul aria-label="Archived activity types">
			{#each archived as type (type.id)}
				<li>
					<TypeTag name={type.name} color={type.color} archived /><Button
						variant="secondary"
						onclick={() => restore(type)}>Restore</Button
					>
				</li>
			{/each}
		</ul>{/if}
{/if}

<Sheet
	bind:open={sheetOpen}
	title={editing ? 'Edit activity type' : 'Add activity type'}
	description="Choose how this type appears and counts in reports."
>
	<Field label="Name" error={error || undefined}>
		{#snippet children(props)}<TextInput
				{...props}
				bind:value={name}
				autocomplete="off"
			/>{/snippet}
	</Field>
	<fieldset>
		<legend>Colour</legend>
		<div class="palette" role="radiogroup" aria-label="Colour">
			{#each BLAZE_KEYS as key (key)}<label class="swatch" title={names[key]}>
					<input
						type="radio"
						name="activity-colour"
						value={key}
						bind:group={color}
						aria-label={names[key]}
					/>
					<Blaze color={key} size="lg" /><span>{names[key]}</span>
				</label>{/each}
		</div>
	</fieldset>
	<Switch label="Counts as work" bind:checked={countsAsWork} />
	<Switch label="Remind me" bind:checked={remind} />
	{#snippet footer()}<Button variant="secondary" onclick={() => (sheetOpen = false)}>Cancel</Button
		><Button disabled={busy} onclick={save}>{editing ? 'Save' : 'Add activity type'}</Button
		>{/snippet}
</Sheet>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
		margin: var(--ht-space-3) 0 var(--ht-space-4);
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
		overflow-wrap: anywhere;
	}

	ul {
		max-width: var(--ht-content-max);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		padding: var(--ht-space-2) 0;
		border-bottom: var(--ht-hairline) solid var(--ht-line);
	}

	.identity {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--ht-space-3);
		min-width: 0;
	}

	.meaning {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.disclosure {
		min-height: var(--ht-target);
		margin-top: var(--ht-space-4);
		padding: var(--ht-space-2) 0;
		border: 0;
		background: transparent;
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--ht-space-2);
		font: var(--ht-type-label);
		color: var(--ht-ink);
	}

	.palette {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--ht-space-1) var(--ht-space-3);
	}

	.swatch {
		display: flex;
		align-items: center;
		gap: var(--ht-space-2);
		min-height: var(--ht-target);
		font: var(--ht-type-label);
		color: var(--ht-ink);
		cursor: pointer;
	}

	.swatch input {
		accent-color: var(--ht-ink);
	}

	.swatch span {
		overflow-wrap: anywhere;
	}

	@media (width >= 768px) {
		.palette {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}
</style>
