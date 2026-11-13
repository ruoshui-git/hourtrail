<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { db, repo } from '$lib/db/app';
	import { deleteRawCoordinates } from '$lib/features/location/capture';
	import {
		deleteCloudRawCoordinates,
		enableRawCoordinateSync,
	} from '$lib/features/location/raw-gps';
	import { ConfirmDialog } from '$lib/components';

	let enabled = $state(false);
	let message = $state('');
	let busy = $state(false);
	let rawSync = $state(false);
	let deleteCloudOpen = $state(false);

	onMount(() => {
		void db.local.get('capture_location').then((row) => (enabled = row?.value === true));
		void db.setting.get('sync_raw_gps').then((row) => (rawSync = row?.value === true));
	});

	async function setRawSync(on: boolean) {
		message = '';
		busy = true;
		try {
			const current = await db.setting.get('sync_raw_gps');
			if (current) await repo.update('setting', 'sync_raw_gps', { value: on });
			else await repo.create('setting', { id: 'sync_raw_gps', value: on });
			if (on) await enableRawCoordinateSync(db, repo);
			rawSync = on;
		} catch {
			message = 'Could not update raw coordinate sync. Try again.';
		} finally {
			busy = false;
		}
	}

	async function setCapture(on: boolean) {
		message = '';
		if (!on) {
			enabled = false;
			await db.local.put({ key: 'capture_location', value: false });
			return;
		}
		if (!navigator.geolocation) {
			message = 'Location is not available in this browser.';
			return;
		}
		busy = true;
		try {
			await new Promise<void>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(
					() => resolve(),
					() => reject(),
					{
						enableHighAccuracy: false,
						maximumAge: 60_000,
						timeout: 8_000,
					},
				);
			});
			enabled = true;
			await db.local.put({ key: 'capture_location', value: true });
		} catch {
			message =
				'Location permission was denied or unavailable. Allow it in your browser settings, then try again.';
		} finally {
			busy = false;
		}
	}

	async function removeCoordinates() {
		await deleteRawCoordinates();
		message = 'Raw coordinates deleted from this device.';
	}
	async function removeCloudCoordinates() {
		busy = true;
		message = '';
		try {
			await deleteCloudRawCoordinates(db, repo);
			message = 'Raw coordinates deleted from the cloud.';
		} catch {
			message = 'Could not delete raw coordinates from the cloud. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Privacy · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Privacy</h1>
</header>
<section class="settings-card">
	<Switch
		label="Capture location on Start and Stop"
		checked={enabled}
		disabled={busy}
		onchange={(on) => void setCapture(on)}
	/>
	<p>
		Location is checked only after you start or stop a live session. Hourtrail does not track your
		location in the background.
	</p>
	<Switch
		label="Back up raw coordinates"
		hint="When this is off, raw coordinates stay on the device that captured them, so a place that wasn't recognized can only be named on that device."
		checked={rawSync}
		disabled={busy}
		onchange={(on) => void setRawSync(on)}
	/>
	{#if !rawSync}
		<p>Turning this off keeps new captures on this device.</p>
	{:else}
		<p>Raw coordinates are included in cloud backups and sync to your other devices.</p>
	{/if}
	{#if !rawSync}
		<Button variant="danger" disabled={busy} onclick={() => (deleteCloudOpen = true)}
			>Delete raw coordinates from the cloud</Button
		>
		<p>Nightly backups already taken keep raw coordinates for up to 60 days.</p>
	{/if}
	<Button variant="secondary" onclick={removeCoordinates}
		>Delete raw coordinates on this device</Button
	>
	{#if message}<p role="status">{message}</p>{/if}
</section>

<ConfirmDialog
	bind:open={deleteCloudOpen}
	title="Delete raw coordinates from the cloud?"
	message="Named places and session places stay. This device keeps its own copy."
	confirmLabel="Delete raw coordinates from the cloud"
	danger
	onconfirm={removeCloudCoordinates}
/>

<style>
	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
		margin-bottom: var(--ht-space-5);
	}

	.settings-card {
		display: grid;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
		color: var(--ht-ink-2);
		font: var(--ht-type-body);
	}

	.settings-card p {
		margin: 0;
		max-width: var(--ht-measure);
	}
</style>
