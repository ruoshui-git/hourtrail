<script lang="ts">
	import { formatMinutes } from '$lib/format';
	import {
		NEW_WORK_ITEM_TYPE_ID,
		readSetting,
		newId,
		planMerge,
		planSplit,
		sessionMinutes,
		parseLocalDateTime,
		toLocalDateTime,
	} from '@hourtrail/core';
	import { openSessionEditor, type EditorRequest } from './editor.svelte';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import Field from '$lib/components/Field.svelte';
	import TextInput from '$lib/components/TextInput.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import Button from '$lib/components/Button.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { showToast } from '$lib/components/toasts.svelte';
	import { sessionWarnings, validateSessionTimes } from './validate';
	import { placeLabel } from '@hourtrail/core';
	import { deleteSessionCoordinates } from '$lib/features/location/capture';
	import Sheet from '$lib/components/Sheet.svelte';
	import { applySessionPlan, findAdjacentCompatibleSession } from './tools';

	let { request, onclose }: { request: EditorRequest; onclose: () => void } = $props();
	const sessionId = $derived(request.mode === 'edit' ? request.sessionId : null);
	const sessions = live(() => db.session.toArray(), []);
	const items = live(() => db.work_item.toArray(), []);
	const types = live(() => db.activity_type.toArray(), []);
	const places = live(() => db.place.toArray(), []);
	const fixes = live(() => db.local_fix.toArray(), []);
	const setting = live(() => db.setting.get('reporting_tz'), undefined);
	const durationSetting = live(() => db.setting.get('duration_format'), undefined);
	const durationFormat = $derived(
		readSetting('duration_format', durationSetting.current?.value) ?? 'hm',
	);
	const durationLabel = (minutes: number) => formatMinutes(minutes, durationFormat);
	const zone = $derived(
		readSetting('reporting_tz', setting.current?.value) ??
			Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const session = $derived(
		sessionId ? sessions.current.find((s) => s.id === sessionId) : undefined,
	);
	let activeId = $state<string | null>(null);
	let itemId = $state<string | null>(null);
	let typeId = $state(NEW_WORK_ITEM_TYPE_ID);
	let startValue = $state('');
	let endValue = $state('');
	let note = $state('');
	let itemSearch = $state('');
	let saved = $state(false);
	let coordinatesRemovedMessage = $state(false);
	let saveError = $state('');
	let error = $state('');
	let warningList = $state<string[]>([]);
	let ambiguous = $state<string[]>([]);
	let confirmDelete = $state(false);
	let splitOpen = $state(false);
	let splitValue = $state('');
	let mergeOpen = $state(false);
	let busy = $state(false);
	let saveTimer: ReturnType<typeof setTimeout>;

	$effect(() => {
		if (request.mode === 'edit' && session && activeId !== session.id) {
			activeId = session.id;
			itemId = session.work_item_id;
			typeId = session.type_id;
			startValue = toLocalDateTime(session.start_at, zone);
			endValue = session.end_at === null ? '' : toLocalDateTime(session.end_at, zone);
			note = session.note;
			if (request.focus === 'note')
				queueMicrotask(() =>
					document.querySelector<HTMLTextAreaElement>('.editor textarea')?.focus(),
				);
		} else if (request.mode === 'new' && activeId !== 'new') {
			activeId = 'new';
			itemId = request.prefill.work_item_id ?? null;
			typeId = items.current.find((item) => item.id === itemId)?.type_id ?? NEW_WORK_ITEM_TYPE_ID;
			startValue =
				request.prefill.start_at === undefined
					? ''
					: toLocalDateTime(request.prefill.start_at, zone);
			endValue =
				request.prefill.end_at === undefined ? '' : toLocalDateTime(request.prefill.end_at, zone);
			note = '';
		}
	});

	const visibleItems = $derived(
		items.current.filter(
			(item) =>
				item.deleted_at === null &&
				item.archived_at === null &&
				item.name.toLocaleLowerCase().includes(itemSearch.toLocaleLowerCase()),
		),
	);
	const visibleTypes = $derived(
		types.current
			.filter(
				(type) => type.deleted_at === null && (type.archived_at === null || type.id === typeId),
			)
			.sort((a, b) => a.sort_key - b.sort_key),
	);
	const allowRunning = $derived(
		request.mode === 'edit' && session !== undefined && session.end_at === null,
	);
	const timeCheck = $derived(
		startValue ? validateSessionTimes(startValue, endValue, zone, allowRunning) : null,
	);
	const duration = $derived(
		timeCheck?.ok ? sessionMinutes(timeCheck.start, timeCheck.end ?? Date.now()) : null,
	);
	const sessionFix = $derived(
		session ? fixes.current.find((fix) => fix.session_id === session.id) : undefined,
	);
	const assignedPlace = $derived(
		session?.place_id ? places.current.find((place) => place.id === session.place_id) : undefined,
	);
	const adjacentSession = $derived(
		session ? findAdjacentCompatibleSession(sessions.current, session) : null,
	);
	const splitAt = $derived(parseLocalDateTime(splitValue, zone));
	const splitPlan = $derived(
		session && splitAt.ok ? planSplit(session, splitAt.instant, newId) : null,
	);
	const mergeResult = $derived(
		session && adjacentSession ? planMerge(session, adjacentSession) : null,
	);
	const mergeLabel = $derived(
		adjacentSession
			? `Merge with the ${formatClock(adjacentSession.start_at, zone)}–${formatClock(adjacentSession.end_at!, zone)} session`
			: '',
	);
	const mergeMessage = $derived(
		mergeResult?.ok && session && adjacentSession
			? `The merged session will run ${formatClock(Math.min(session.start_at, adjacentSession.start_at), zone)}–${formatClock(Math.max(session.end_at!, adjacentSession.end_at!), zone)}${mergeResult.gapMs > 0 ? `, including ${durationLabel(Math.ceil(mergeResult.gapMs / 60_000))} not recorded` : ''}.`
			: '',
	);
	function formatClock(timestamp: number, timeZone: string) {
		return new Intl.DateTimeFormat('en-US', {
			timeZone,
			hour: 'numeric',
			minute: '2-digit',
		}).format(timestamp);
	}
	function beginSplit() {
		if (!session || session.end_at === null) return;
		const midpoint = Math.floor((session.start_at + session.end_at) / 2 / 60_000) * 60_000;
		splitValue = toLocalDateTime(midpoint, zone);
		splitOpen = true;
	}
	async function confirmSplit() {
		if (!session || !splitAt.ok) return;
		const result = planSplit(session, splitAt.instant, newId);
		if (!result.ok) return;
		const undo = await applySessionPlan(repo, 'Split session', result.plan);
		splitOpen = false;
		showToast({ message: 'Session split', undo: () => repo.undo(undo) });
	}
	async function confirmMerge() {
		if (!session || !adjacentSession || !mergeResult?.ok) return;
		const keptId = mergeResult.plan.update[0]?.id;
		const undo = await applySessionPlan(repo, 'Merge sessions', mergeResult.plan);
		mergeOpen = false;
		if (keptId && keptId !== session.id) openSessionEditor(keptId);
		showToast({ message: 'Sessions merged', undo: () => repo.undo(undo) });
	}

	function flashSaved() {
		saved = true;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => (saved = false), 1800);
	}
	function refreshValidation() {
		error = timeCheck && !timeCheck.ok ? timeCheck.message : '';
		ambiguous = timeCheck?.ok
			? [timeCheck.ambiguousStart ? 'start' : '', timeCheck.ambiguousEnd ? 'end' : ''].filter(
					Boolean,
				)
			: [];
		warningList = timeCheck?.ok
			? sessionWarnings(timeCheck.start, timeCheck.end, sessions.current, items.current, sessionId)
			: [];
	}
	function ambiguousHint(field: 'start' | 'end') {
		const value = field === 'start' ? startValue : endValue;
		const [hourText, minute] = value.slice(11).split(':');
		const hour = Number(hourText);
		const suffix = hour >= 12 ? 'PM' : 'AM';
		const displayHour = hour % 12 || 12;
		return `Clocks went back at this time; using the first ${displayHour}:${minute} ${suffix}.`;
	}
	async function saveField(field: 'item' | 'type' | 'start' | 'end' | 'note') {
		if (request.mode !== 'edit' || !session || busy) return;
		refreshValidation();
		if (error && (field === 'start' || field === 'end')) return;
		let changes: Record<string, unknown> = {};
		if (field === 'item') changes = { work_item_id: itemId };
		if (field === 'type') changes = { type_id: typeId };
		if (field === 'note') changes = { note };
		if (field === 'start' || field === 'end') {
			if (!timeCheck?.ok) return;
			changes = {
				start_at: timeCheck.start,
				end_at: timeCheck.end,
				start_tz: zone,
				end_tz: timeCheck.end === null ? null : zone,
			};
		}
		try {
			await repo.update('session', session.id, changes);
			saveError = '';
			flashSaved();
		} catch {
			saveError = 'Could not save this change. It is still here; try again.';
		}
	}
	async function assignPlace(value: string) {
		if (!session) return;
		await repo.update('session', session.id, {
			place_id: value || null,
			place_state: value ? 'set' : 'dismissed',
			place_candidates: [],
		});
		flashSaved();
	}
	async function removeCoordinates() {
		const targetId = request.mode === 'edit' ? request.sessionId : null;
		if (!targetId) return;
		coordinatesRemovedMessage = true;
		try {
			await deleteSessionCoordinates(targetId);
			flashSaved();
		} catch {
			saveError = 'Could not remove these coordinates. Try again.';
		}
	}
	async function createItem() {
		const name = itemSearch.trim();
		if (!name) return;
		const created = await repo.create('work_item', {
			name,
			description: '',
			type_id: NEW_WORK_ITEM_TYPE_ID,
			project_id: null,
			place_id: null,
			pinned_at: null,
			pin_sort: 0,
			archived_at: null,
		});
		itemId = created.id;
		itemSearch = '';
		if (request.mode === 'edit') await saveField('item');
	}
	async function addSession() {
		refreshValidation();
		if (!timeCheck?.ok || !startValue || (endValue === '' && request.mode === 'new')) return;
		busy = true;
		try {
			const created = await repo.create('session', {
				work_item_id: itemId,
				type_id: typeId,
				start_at: timeCheck.start,
				start_tz: zone,
				end_at: timeCheck.end,
				end_tz: timeCheck.end === null ? null : zone,
				note,
				source: 'manual',
				place_id: null,
				place_state: 'none',
				place_candidates: [],
				flags: {},
				origin_device_id: await repo.deviceId(),
			});
			void created;
			onclose();
		} catch {
			error = 'Could not add this session. Your entry is still here; try again.';
		} finally {
			busy = false;
		}
	}
	async function deleteSession() {
		if (!session) return;
		const undo = await repo.remove('session', session.id);
		onclose();
		showToast({ message: 'Session deleted', undo: () => repo.undo(undo) });
	}
	$effect(() => {
		if (request.mode !== 'edit' || !session) return;
		const editorSessionId = session.id;
		if (!editorSessionId) return;
		let textarea: HTMLTextAreaElement | null = null;
		const save = () => void saveField('note');
		const attach = () => {
			textarea = document.querySelector('.editor textarea');
			if (!textarea) return;
			textarea.addEventListener('blur', save);
			observer.disconnect();
		};
		const observer = new MutationObserver(attach);
		observer.observe(document.body, { childList: true, subtree: true });
		queueMicrotask(attach);
		return () => {
			observer.disconnect();
			textarea?.removeEventListener('blur', save);
		};
	});
</script>

{#if request.mode === 'edit' && !session}
	<p>This session is unavailable.</p>
{:else}
	<div class="editor">
		<Field label="Work item">
			{#snippet children(props)}<TextInput
					{...props}
					bind:value={itemSearch}
					placeholder={itemId
						? (items.current.find((item) => item.id === itemId)?.name ?? 'Untitled session')
						: 'Untitled session'}
				/>{/snippet}
		</Field>
		<div class="item-actions">
			<select
				aria-label="Choose work item"
				value={itemId ?? ''}
				onchange={(event) => {
					itemId = event.currentTarget.value || null;
					void saveField('item');
				}}
			>
				<option value="">Untitled session</option>
				{#each visibleItems as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
			</select>
			{#if itemSearch.trim()}<Button variant="secondary" onclick={() => void createItem()}
					>Create “{itemSearch.trim()}”</Button
				>{/if}
		</div>
		<Field label="Activity type">
			{#snippet children(props)}<select
					{...props}
					bind:value={typeId}
					onchange={() => void saveField('type')}
					>{#each visibleTypes as type (type.id)}<option value={type.id}
							>{type.name}{type.archived_at !== null ? ' (archived)' : ''}</option
						>{/each}</select
				>{/snippet}
		</Field>
		<Field
			label="Start"
			error={error && timeCheck && !timeCheck.ok && timeCheck.field === 'start' ? error : undefined}
			hint={ambiguous.includes('start') ? ambiguousHint('start') : undefined}
		>
			{#snippet children(props)}<input
					{...props}
					type="datetime-local"
					bind:value={startValue}
					onblur={() => void saveField('start')}
					oninput={refreshValidation}
				/>{/snippet}
		</Field>
		<Field
			label="End"
			error={error && timeCheck && !timeCheck.ok && timeCheck.field === 'end' ? error : undefined}
			hint={ambiguous.includes('end')
				? ambiguousHint('end')
				: endValue === '' && request.mode === 'edit' && session?.end_at === null
					? 'Still running'
					: undefined}
		>
			{#snippet children(props)}<input
					{...props}
					type="datetime-local"
					bind:value={endValue}
					onblur={() => void saveField('end')}
					oninput={refreshValidation}
				/>{/snippet}
		</Field>
		<p class="duration">
			Duration: {duration === null ? '—' : durationLabel(duration)}
		</p>
		<Field label="Note" id="session-note">
			{#snippet children(props)}<div>
					<TextArea {...props} bind:value={note} rows={3} placeholder="Add a note" />
				</div>{/snippet}
		</Field>
		{#if request.mode === 'edit' && session}
			{#if session.end_at !== null}
				<div class="tool-actions">
					<Button variant="secondary" onclick={beginSplit}>Split</Button>
					{#if adjacentSession}<Button variant="secondary" onclick={() => (mergeOpen = true)}
							>{mergeLabel}</Button
						>{/if}
				</div>
			{/if}
			<Field label="Place">
				{#snippet children(props)}
					<div class="place-field">
						<p>
							{assignedPlace
								? sessionFix
									? placeLabel(assignedPlace.name, sessionFix.accuracy_m)
									: assignedPlace.name
								: 'No place assigned'}
						</p>
						<select
							{...props}
							value={session.place_id ?? ''}
							aria-label="Choose place"
							onchange={(event) => void assignPlace(event.currentTarget.value)}
						>
							<option value="">None</option>
							{#each places.current.filter((place) => place.deleted_at === null && place.archived_at === null) as place (place.id)}
								<option value={place.id}>{place.name}</option>
							{/each}
						</select>
						<button
							class="remove-coordinates"
							type="button"
							disabled={!sessionFix}
							onclick={() => void removeCoordinates()}>Remove coordinates</button
						>
						{#if coordinatesRemovedMessage}<p role="status">Coordinates removed</p>{/if}
					</div>
				{/snippet}
			</Field>
		{/if}
		{#if saved}<p class="saved" role="status">Saved</p>{/if}
		{#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
		{#each warningList as warning (warning)}<Banner tone="caution" message={warning} />{/each}
		{#if request.mode === 'new'}<Button
				wide
				disabled={!timeCheck?.ok || !startValue || !endValue}
				{busy}
				onclick={() => void addSession()}>Add session</Button
			>
		{:else}<div class="delete-row">
				<Button variant="danger" onclick={() => (confirmDelete = true)}>Delete session</Button>
			</div>{/if}
	</div>
{/if}
<ConfirmDialog
	bind:open={confirmDelete}
	title="Delete this session?"
	message="This session will be deleted."
	confirmLabel="Delete session"
	danger
	onconfirm={deleteSession}
/>
<Sheet bind:open={splitOpen} title="Split session">
	<div class="editor">
		<Field
			label="Split at"
			error={splitPlan && !splitPlan.ok
				? splitPlan.error === 'running'
					? "A running session can't be split. Stop it first."
					: 'Choose a time at least one minute inside the session.'
				: undefined}
		>
			{#snippet children(props)}<input
					{...props}
					type="datetime-local"
					bind:value={splitValue}
				/>{/snippet}
		</Field>
		{#if session && session.end_at !== null && splitAt.ok}
			<p class="duration">
				{formatClock(session.start_at, zone)}–{formatClock(splitAt.instant, zone)}, {durationLabel(
					sessionMinutes(session.start_at, splitAt.instant),
				)}
			</p>
			<p class="duration">
				{formatClock(splitAt.instant, zone)}–{formatClock(session.end_at, zone)}, {durationLabel(
					sessionMinutes(splitAt.instant, session.end_at),
				)}
			</p>
		{/if}
		<Button wide disabled={!splitPlan?.ok} onclick={() => void confirmSplit()}>Split session</Button
		>
	</div>
</Sheet>
<ConfirmDialog
	bind:open={mergeOpen}
	title="Merge sessions?"
	message={mergeMessage}
	confirmLabel="Merge sessions"
	onconfirm={confirmMerge}
/>

<style>
	.editor {
		display: grid;
		gap: var(--ht-space-4);
	}

	.editor :global(select),
	.editor :global(input[type='datetime-local']) {
		width: 100%;
		min-height: var(--ht-control-height);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		padding: var(--ht-space-2) var(--ht-space-3);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-body);
	}

	.item-actions {
		display: grid;
		gap: var(--ht-space-2);
	}

	.duration,
	.saved,
	.error {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}

	.place-field {
		display: grid;
		gap: var(--ht-space-2);
	}

	.place-field p {
		margin: 0;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.remove-coordinates {
		justify-self: start;
		min-height: var(--ht-target);
		padding: var(--ht-space-2) var(--ht-space-3);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
	}

	.remove-coordinates:disabled {
		color: var(--ht-ink-3);
	}

	.error {
		color: var(--ht-danger);
	}

	.saved {
		color: var(--ht-ink-2);
	}

	.delete-row {
		display: flex;
		justify-content: flex-end;
	}

	.tool-actions {
		display: grid;
		gap: var(--ht-space-2);
	}
</style>
