<script lang="ts">
	import { resolve } from '$app/paths';
	import { DEFAULT_PLACE_RADIUS_M } from '@hourtrail/core';
	import type { RecordOf } from '@hourtrail/core';
	import { ArrowLeft } from '@lucide/svelte';
	import {
		Button,
		Field,
		Menu,
		Sheet,
		Stepper,
		TextArea,
		TextInput,
		showToast,
	} from '$lib/components';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { mapsUrl, parseCoordinates, referenceCount } from '$lib/features/places/domain';
	type Place = RecordOf<'place'>;
	const data = live(
		async () => Promise.all([db.place.toArray(), db.session.toArray(), db.work_item.toArray()]),
		[[], [], []] as [Place[], RecordOf<'session'>[], RecordOf<'work_item'>[]],
	);
	let archivedOpen = $state(false);
	let sheetOpen = $state(false);
	let editing = $state<Place | null>(null);
	let merging = $state<Place | null>(null);
	let name = $state('');
	let description = $state('');
	let lat = $state('');
	let lng = $state('');
	let radius = $state(DEFAULT_PLACE_RADIUS_M);
	let error = $state('');
	let locationMessage = $state('');
	let busy = $state(false);
	let all = $derived(data.current[0].filter((p) => p.deleted_at === null));
	let active = $derived(
		all
			.filter((p) => p.archived_at === null)
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
	);
	let archived = $derived(
		all
			.filter((p) => p.archived_at !== null)
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
	);
	let targets = $derived(active.filter((p) => p.id !== merging?.id));
	function refs(place: Place) {
		return referenceCount(place.id, data.current[1], data.current[2]);
	}
	function reset(place?: Place) {
		editing = place ?? null;
		name = place?.name ?? '';
		description = place?.description ?? '';
		lat = place ? String(place.lat) : '';
		lng = place ? String(place.lng) : '';
		radius = place?.radius_m ?? DEFAULT_PLACE_RADIUS_M;
		error = '';
		locationMessage = '';
		sheetOpen = true;
	}
	function pastePair(event: ClipboardEvent) {
		const p = parseCoordinates(event.clipboardData?.getData('text') ?? '');
		if (p) {
			event.preventDefault();
			lat = String(p.lat);
			lng = String(p.lng);
		}
	}
	function useLocation() {
		if (!navigator.geolocation) {
			locationMessage = 'Location is unavailable on this device. Enter coordinates instead.';
			return;
		}
		locationMessage = 'Getting your location…';
		navigator.geolocation.getCurrentPosition(
			(position) => {
				lat = String(position.coords.latitude);
				lng = String(position.coords.longitude);
				locationMessage = `Current location accuracy ±${Math.round(position.coords.accuracy)} m.`;
			},
			() => {
				locationMessage =
					'Could not get your location. Check permission or enter coordinates instead.';
			},
			{ enableHighAccuracy: true, timeout: 20_000 },
		);
	}
	async function save() {
		const cleanName = name.trim();
		const coordinates = parseCoordinates(`${lat},${lng}`);
		if (!cleanName) {
			error = 'Enter a name for this place.';
			return;
		}
		if (!coordinates) {
			error = 'Enter a valid latitude and longitude.';
			return;
		}
		busy = true;
		try {
			const fields = {
				name: cleanName,
				description: description.trim(),
				...coordinates,
				radius_m: radius,
			};
			if (editing) await repo.update('place', editing.id, fields);
			else await repo.create('place', { ...fields, archived_at: null });
			sheetOpen = false;
		} catch {
			error = 'Could not save this place. Check the details and try again.';
		} finally {
			busy = false;
		}
	}
	async function archive(place: Place) {
		const undo = await repo.editMany('Archive', [
			{ entity: 'place', id: place.id, changes: { archived_at: Date.now() } },
		]);
		showToast({ message: 'Place archived.', undo: () => repo.undo(undo) });
	}
	async function restore(place: Place) {
		await repo.update('place', place.id, { archived_at: null });
	}
	async function deletePlace(place: Place) {
		const undo = await repo.remove('place', place.id);
		showToast({ message: 'Place deleted.', undo: () => repo.undo(undo) });
	}
	async function merge(target: Place) {
		if (!merging) return;
		const source = merging;
		const sessions = data.current[1].filter(
			(s) => s.place_id === source.id && s.deleted_at === null,
		);
		const undo = await repo.editMany('Merge', [
			...sessions.map((session) => ({
				entity: 'session' as const,
				id: session.id,
				changes: { place_id: target.id },
			})),
			{ entity: 'place', id: source.id, changes: { archived_at: Date.now() } },
		]);
		merging = null;
		showToast({
			message: `Merged into ${target.name}`,
			undo: () => repo.undo(undo),
		});
	}
</script>

<svelte:head><title>Places · Settings · Hourtrail</title></svelte:head>
<a class="back" href={resolve('/settings')}><ArrowLeft aria-hidden="true" />Settings</a>
<header>
	<h1>Places</h1>
	<Button onclick={() => reset()}>Add place</Button>
</header>
{#if active.length}<ul aria-label="Places">
		{#each active as place (place.id)}<li>
				<div class="detail">
					<strong>{place.name}</strong><span>{place.description.split('\n')[0]}</span><span
						>Radius {place.radius_m} m</span
					>
				</div>
				<Menu
					label={`Options for ${place.name}`}
					items={[
						{ label: 'Edit', onselect: () => reset(place) },
						{ label: 'Merge into…', onselect: () => (merging = place) },
						{ label: 'Archive', onselect: () => archive(place) },
						...(refs(place) === 0
							? [{ label: 'Delete', danger: true, onselect: () => deletePlace(place) }]
							: []),
					]}
				/>
			</li>{/each}
	</ul>{:else}<p>No places yet. Add a place to name a location you visit often.</p>{/if}
{#if archived.length}<button
		class="disclosure"
		aria-expanded={archivedOpen}
		onclick={() => (archivedOpen = !archivedOpen)}>Archived ({archived.length})</button
	>{#if archivedOpen}<ul aria-label="Archived places">
			{#each archived as place (place.id)}<li>
					<div class="detail">
						<strong>{place.name}</strong><span>Radius {place.radius_m} m</span>
					</div>
					<Button variant="secondary" onclick={() => restore(place)}>Restore</Button>
				</li>{/each}
		</ul>{/if}{/if}
{#if merging}<section class="merge">
		<h2>Merge {merging.name} into</h2>
		{#each targets as target (target.id)}<Button variant="secondary" onclick={() => merge(target)}
				>{target.name}</Button
			>{/each}<Button variant="quiet" onclick={() => (merging = null)}>Cancel</Button>
	</section>{/if}
<Sheet
	bind:open={sheetOpen}
	title={editing ? 'Edit place' : 'Add place'}
	description="Save a name and approximate position for a place."
>
	<Field label="Name" error={error || undefined}
		>{#snippet children(props)}<TextInput
				{...props}
				bind:value={name}
				autocomplete="off"
			/>{/snippet}</Field
	>
	<Field label="Description"
		>{#snippet children(props)}<TextArea
				{...props}
				bind:value={description}
				rows={2}
			/>{/snippet}</Field
	>
	<div class="coords" onpaste={pastePair}>
		<Field label="Latitude"
			>{#snippet children(props)}<TextInput
					{...props}
					bind:value={lat}
					placeholder="45.123"
				/>{/snippet}</Field
		><Field label="Longitude"
			>{#snippet children(props)}<TextInput
					{...props}
					bind:value={lng}
					placeholder="-73.456"
				/>{/snippet}</Field
		>
	</div>
	<Button variant="secondary" onclick={useLocation}>Use my current location</Button
	>{#if locationMessage}<p class="hint" aria-live="polite">{locationMessage}</p>{/if}
	<Stepper label="Radius" bind:value={radius} min={25} max={2000} step={25} unit="metres" />
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	{#if parseCoordinates(`${lat},${lng}`)}<a
			href={mapsUrl(parseCoordinates(`${lat},${lng}`)!)}
			target="_blank"
			rel="noreferrer">Open in Maps</a
		>{/if}
	{#snippet footer()}<Button variant="secondary" onclick={() => (sheetOpen = false)}>Cancel</Button
		><Button disabled={busy} onclick={save}>{editing ? 'Save' : 'Add place'}</Button>{/snippet}
</Sheet>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--ht-space-2);
		min-height: var(--ht-target);
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
		text-decoration: none;
	}

	.back :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-3);
		margin: var(--ht-space-3) 0 var(--ht-space-5);
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	ul {
		max-width: var(--ht-content-max);
		padding: 0;
		margin: 0;
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

	.detail {
		display: grid;
		gap: var(--ht-space-1);
		min-width: 0;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.detail strong {
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
	}

	.disclosure {
		min-height: var(--ht-target);
		margin-top: var(--ht-space-4);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
	}

	.merge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ht-space-2);
		margin-top: var(--ht-space-4);
	}

	h2 {
		width: 100%;
		font: var(--ht-type-heading);
	}

	.coords {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ht-space-3);
	}

	.hint {
		margin: 0;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	a:focus-visible,
	button:focus-visible {
		outline: var(--ht-focus-width) solid var(--ht-ink);
		outline-offset: var(--ht-focus-offset);
	}
</style>
