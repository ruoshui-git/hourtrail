<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { deviceNameSchema } from '@hourtrail/core';
	import { ApiError, OfflineError } from '$lib/api/client';
	import { Button, Field, TextInput } from '$lib/components';
	import { auth } from '$lib/features/cloud/auth.svelte';
	import { codeFromHash, guessDeviceName, lockoutMessage } from '$lib/features/cloud/domain';

	let code = $state('');
	let name = $state('');
	let error = $state('');
	let nameError = $state('');
	let busy = $state(false);
	let loading = $state(true);

	onMount(async () => {
		name = guessDeviceName(navigator.userAgent, navigator.platform);
		code = codeFromHash(location.hash) ?? '';
		history.replaceState(history.state, '', `${location.pathname}${location.search}`);
		await auth.hydrate();
		try {
			await auth.refresh();
		} catch {
			/* Linking can be completed after the device reconnects. */
		}
		loading = false;
	});

	async function submit() {
		error = '';
		nameError = '';
		try {
			deviceNameSchema.parse(name);
		} catch {
			nameError = 'Enter a device name from 1 to 60 characters.';
			return;
		}
		busy = true;
		try {
			await auth.link(code, name);
			await goto(resolve('/settings/cloud'));
		} catch (cause) {
			if (cause instanceof OfflineError)
				error = "You're offline. Sign in when you have a connection.";
			else if (cause instanceof ApiError && cause.code === 'locked')
				error = lockoutMessage(Number(cause.details?.retry_after_s ?? 900));
			else if (cause instanceof ApiError && cause.status === 401)
				error = 'That code is not valid. Codes work once, for five minutes.';
			else error = 'Could not link this device. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Link this device · Hourtrail</title></svelte:head>
<main>
	<h1>Link this device</h1>
	{#if loading}<p>Loading…</p>
	{:else if auth.status === 'signed-in'}
		<p>This device is already signed in as {auth.device?.name}.</p>
		<a href={resolve('/settings/cloud')}>Settings</a>
	{:else}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<Field label="Code" {error}>
				{#snippet children(props)}<TextInput
						{...props}
						bind:value={code}
						placeholder="XXXX-XXXX"
						autocomplete="off"
					/>{/snippet}
			</Field>
			<Field label="Device name" error={nameError}>
				{#snippet children(props)}<TextInput
						{...props}
						bind:value={name}
						autocomplete="off"
					/>{/snippet}
			</Field>
			<Button type="submit" wide {busy}>Link this device</Button>
		</form>
	{/if}
</main>

<style>
	main {
		max-width: var(--ht-content-narrow);
	}

	h1 {
		margin: 0 0 var(--ht-space-5);
		color: var(--ht-ink);
		font: var(--ht-type-title);
	}

	form {
		display: grid;
		gap: var(--ht-space-4);
	}

	main > p {
		color: var(--ht-ink-2);
		font: var(--ht-type-body);
	}

	a {
		color: var(--ht-ink);
		font: var(--ht-type-body);
	}
</style>
