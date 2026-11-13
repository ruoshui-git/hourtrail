<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { db } from '$lib/db/app';
	import { deleteRawCoordinates } from '$lib/features/location/capture';

	let enabled = $state(false);
	let message = $state('');
	let busy = $state(false);

	onMount(() => {
		void db.local.get('capture_location').then((row) => (enabled = row?.value === true));
	});

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
</script>

<svelte:head><title>Privacy · Hourtrail</title></svelte:head>
<h1>Privacy</h1>
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
	<p>
		Raw coordinates stay on this device. Only named places and the session’s assigned place sync.
		With raw coordinate sync off, a place created from a capture is available only on the device
		that recorded it.
	</p>
	<Button variant="secondary" onclick={removeCoordinates}
		>Delete raw coordinates on this device</Button
	>
	{#if message}<p role="status">{message}</p>{/if}
</section>

<style>
	h1 {
		margin: 0 0 var(--ht-space-5);
		font: var(--ht-type-title);
		color: var(--ht-ink);
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
	}
</style>
