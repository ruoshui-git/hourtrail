<script lang="ts">
	import { parseBackup, ENTITIES } from '@hourtrail/core';
	import type { BackupFile, Entity } from '@hourtrail/core';
	import { Banner, Button, Field, SegmentedControl, Sheet, TextInput } from '$lib/components';
	import { repo } from '$lib/db/app';
	import type { RestoreMode } from '$lib/db/repo';

	let {
		saveBackup,
		saveError = '',
		disabled = false,
		restoring = $bindable(false),
		tz,
	}: {
		saveBackup: () => Promise<boolean>;
		saveError?: string;
		disabled?: boolean;
		restoring?: boolean;
		tz?: string;
	} = $props();
	let picker: HTMLInputElement;
	// Keep parsed records plain so IndexedDB can clone them.
	let file = $state.raw<BackupFile | null>(null);
	let open = $state(false);
	let reading = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let confirmation = $state('');
	let choice = $state('add-missing');
	let error = $state('');
	let result = $state('');
	let completed = $state(0);
	let total = $state(0);
	const labels: Record<Entity, [string, string]> = {
		session: ['session', 'sessions'],
		work_item: ['work item', 'work items'],
		place: ['place', 'places'],
		activity_type: ['activity type', 'activity types'],
		project: ['project', 'projects'],
		session_fix: ['synced raw fix', 'synced raw fixes'],
		review_mark: ['review mark', 'review marks'],
		day_review: ['day review', 'day reviews'],
		setting: ['setting', 'settings'],
		report_preset: ['report preset', 'report presets'],
		conflict: ['conflict', 'conflicts'],
	};
	const counts = $derived(
		file
			? [
					...(['session', 'work_item', 'place'] as const),
					...ENTITIES.filter((entity) => !['session', 'work_item', 'place'].includes(entity)),
				]
					.map((entity) => {
						const count = file!.records[entity].filter(
							(record) => record.deleted_at === null,
						).length;
						return `${count.toLocaleString('en-US')} ${labels[entity][count === 1 ? 0 : 1]}`;
					})
					.join(', ') +
					`, ${file.local_fixes.length.toLocaleString('en-US')} local raw ${file.local_fixes.length === 1 ? 'fix' : 'fixes'}`
			: '',
	);
	function date(at: number, detailed = false) {
		return new Intl.DateTimeFormat(
			'en-US',
			detailed
				? {
						weekday: 'short',
						month: 'short',
						day: 'numeric',
						year: 'numeric',
						hour: 'numeric',
						minute: '2-digit',
						timeZone: tz,
					}
				: { month: 'short', day: 'numeric', timeZone: tz },
		).format(at);
	}
	async function selected(event: Event) {
		const picked = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!picked) return;
		reading = true;
		error = '';
		result = '';
		file = null;
		saved = false;
		confirmation = '';
		choice = 'add-missing';
		try {
			const parsed = parseBackup(await picked.text());
			if (!parsed.ok) {
				error =
					parsed.error === 'newer-version'
						? 'This backup was made by a newer version of Hourtrail. Update the app, then try again.'
						: "This isn't a Hourtrail backup file.";
				return;
			}
			file = parsed.file;
			open = true;
		} catch {
			error = "This isn't a Hourtrail backup file.";
		} finally {
			reading = false;
		}
	}
	async function save() {
		if (saving) return;
		saving = true;
		try {
			saved = await saveBackup();
		} finally {
			saving = false;
		}
	}
	async function restore() {
		if (
			!file ||
			restoring ||
			saving ||
			(choice === 'replace' && (!saved || confirmation !== 'replace'))
		)
			return;
		const backup = file;
		const mode = choice as RestoreMode;
		restoring = true;
		open = false;
		error = '';
		result = '';
		completed = 0;
		total = 0;
		try {
			const counts = await repo.restoreRecords(backup, mode, (done, count) => {
				completed = done;
				total = count;
			});
			result =
				mode === 'replace'
					? `This device now matches the backup from ${date(backup.exported_at)}.`
					: `Added ${counts.added.toLocaleString('en-US')} records. ${counts.skipped.toLocaleString('en-US')} were already here.`;
		} catch {
			error = 'The restore could not be completed. Choose the backup file and try again.';
		} finally {
			restoring = false;
			file = null;
		}
	}
</script>

<input
	bind:this={picker}
	type="file"
	accept=".json,application/json"
	aria-label="Backup file"
	hidden
	disabled={reading || restoring || disabled}
	onchange={selected}
/>
<Button
	variant="secondary"
	busy={reading}
	disabled={restoring || disabled}
	onclick={() => {
		picker.value = '';
		picker.click();
	}}>Restore from a backup file</Button
>
{#if error}<Banner tone="danger" message={error} />{/if}
{#if restoring}<p role="status">
		Restoring… {completed.toLocaleString('en-US')} of {total.toLocaleString('en-US')}
	</p>{/if}
{#if result}<p role="status">{result}</p>{/if}
<Sheet bind:open title="Restore from a backup file">
	{#if file}
		<p>Backup from {date(file.exported_at, true)}</p>
		<p class="counts">{counts}</p>
		{#if file.range.first_start_at !== null && file.range.last_start_at !== null}
			<p>
				Sessions: {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: tz }).format(
					file.range.first_start_at,
				)} – {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: tz }).format(
					file.range.last_start_at,
				)}
			</p>
		{/if}
		<SegmentedControl
			bind:value={choice}
			label="Restore choice"
			options={[
				{ value: 'add-missing', label: "Add what's missing" },
				{ value: 'replace', label: 'Replace everything' },
			]}
		/>
		{#if choice === 'add-missing'}
			<p>Adds only records whose ids are not on this device. Nothing here is changed or removed.</p>
		{:else}
			<p>Makes this device, and the cloud when signed in, match the backup exactly.</p>
			<Button variant="secondary" busy={saving} onclick={save}>Save a backup of this device</Button>
			{#if saved}<p>Backup saved.</p>{/if}
			{#if saveError}<Banner tone="danger" message={saveError} />{/if}
			<Field label="Type replace to confirm">
				{#snippet children({ id, describedBy, invalid })}<TextInput
						{id}
						{describedBy}
						{invalid}
						bind:value={confirmation}
						disabled={!saved || saving}
						autocomplete="off"
					/>{/snippet}
			</Field>
		{/if}
		<Button
			disabled={saving || (choice === 'replace' && (!saved || confirmation !== 'replace'))}
			onclick={restore}>{choice === 'replace' ? 'Replace everything' : "Add what's missing"}</Button
		>
	{/if}
</Sheet>

<style>
	p {
		margin: 0;
		font: var(--ht-type-body);
		color: var(--ht-ink);
	}

	.counts {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}
</style>
