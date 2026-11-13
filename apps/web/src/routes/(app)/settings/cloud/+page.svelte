<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { deviceNameSchema, formatLinkCode } from '@hourtrail/core';
	import { ChevronLeft } from '@lucide/svelte';
	import { encode } from 'uqr';
	import { ApiError, OfflineError } from '$lib/api/client';
	import {
		Banner,
		Button,
		ConfirmDialog,
		Field,
		SegmentedControl,
		Sheet,
		TextInput,
	} from '$lib/components';
	import SyncControl from '$lib/features/sync/ui/SyncControl.svelte';
	import { auth } from '$lib/features/cloud/auth.svelte';
	import {
		formatLastSeen,
		guessDeviceName,
		linkUrl,
		lockoutMessage,
	} from '$lib/features/cloud/domain';

	let mode = $state<'key' | 'code'>('key');
	let previousMode: 'key' | 'code' = 'key';
	let key = $state('');
	let code = $state('');
	let name = $state('');
	let error = $state('');
	let nameError = $state('');
	let busy = $state(false);
	let linkOpen = $state(false);
	let linkCode = $state('');
	let expiresAt = $state(0);
	let now = $state(Date.now());
	let revokeTarget = $state<{ id: string; name: string } | null>(null);
	let revokeOpen = $state(false);
	let signOutOpen = $state(false);
	let refreshError = $state('');
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let seconds = $derived(Math.min(300, Math.max(0, Math.ceil((expiresAt - now) / 1000))));
	let qr = $derived(
		linkCode
			? encode(linkUrl(typeof window === 'undefined' ? '' : location.origin, linkCode), {
					border: 4,
				})
			: null,
	);

	$effect(() => {
		if (mode !== previousMode) {
			error = '';
			nameError = '';
			previousMode = mode;
		}
	});

	onMount(() => {
		name = guessDeviceName(navigator.userAgent, navigator.platform);
		const timer = window.setInterval(() => (now = Date.now()), 1000);
		void initialize();
		return () => window.clearInterval(timer);
	});

	async function initialize() {
		await auth.hydrate();
		try {
			await auth.refresh();
		} catch {
			/* Cached device stays visible while offline. */
		}
		if (auth.status === 'signed-in') await refreshDevices();
	}
	async function refreshDevices() {
		refreshError = '';
		try {
			await auth.loadDevices();
		} catch (cause) {
			if (cause instanceof OfflineError) refreshError = cause.message;
			else if (!(cause instanceof ApiError && cause.status === 401))
				refreshError = 'Could not load devices. Try again.';
		}
	}
	function messageFor(cause: unknown, intent: 'key' | 'code') {
		if (cause instanceof OfflineError) return "You're offline. Sign in when you have a connection.";
		if (cause instanceof ApiError) {
			if (cause.code === 'locked')
				return lockoutMessage(Number(cause.details?.retry_after_s ?? 900));
			if (cause.status === 401)
				return intent === 'key'
					? 'That account key does not match.'
					: 'That code is not valid. Codes work once, for five minutes.';
		}
		return 'Could not sign in. Try again.';
	}
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
			if (mode === 'key') await auth.enroll(key, name);
			else await auth.link(code, name);
			key = '';
			code = '';
			await refreshDevices();
		} catch (cause) {
			error = messageFor(cause, mode);
		} finally {
			busy = false;
		}
	}
	async function makeLink() {
		try {
			const result = await auth.startLink();
			linkCode = formatLinkCode(result.code);
			expiresAt = result.expires_at;
			linkOpen = true;
		} catch (cause) {
			if (cause instanceof ApiError && cause.status === 401) return;
			refreshError =
				cause instanceof OfflineError ? cause.message : 'Could not create a link code. Try again.';
		}
	}
</script>

<svelte:head><title>Cloud and devices · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Cloud and devices</h1>
</header>
{#if auth.signedOutBy401}<Banner
		tone="caution"
		message="You were signed out. Sign in again to back up your records."
	/>{/if}
{#if auth.status !== 'signed-in'}
	<p class="intro">On this device only. Sign in to back up and sync your records.</p>
	<SegmentedControl
		bind:value={mode}
		label="Sign-in method"
		options={[
			{ value: 'key', label: 'Account key' },
			{ value: 'code', label: 'Code from another device' },
		]}
	/>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		{#if mode === 'key'}
			<Field label="Account key" {error}>
				{#snippet children(props)}<input
						{...props}
						class="key-input"
						bind:value={key}
						autocomplete="off"
						autocorrect="off"
						autocapitalize="none"
						spellcheck="false"
					/>{/snippet}
			</Field>
		{:else}
			<Field label="Code" hint="Enter the code shown on your other device." {error}>
				{#snippet children(props)}<TextInput
						{...props}
						bind:value={code}
						placeholder="XXXX-XXXX"
						autocomplete="off"
					/>{/snippet}
			</Field>
		{/if}
		<Field label="Device name" hint="Shown in your device list." error={nameError}>
			{#snippet children(props)}<TextInput
					{...props}
					bind:value={name}
					autocomplete="off"
				/>{/snippet}
		</Field>
		<Button type="submit" wide {busy}>{mode === 'key' ? 'Sign in' : 'Link this device'}</Button>
	</form>
{:else}
	<p class="signed">Signed in as {auth.device?.name}</p>
	<SyncControl />
	{#if refreshError}<Banner tone="caution" message={refreshError} />{/if}
	<section aria-label="Devices">
		{#each auth.devices as device (device.id)}
			<div class="device">
				<div>
					<strong>{device.name}</strong>{#if device.current}<span>This device</span>{:else}<span
							>Last seen {formatLastSeen(device.last_seen_at, now, zone)}</span
						>{/if}
				</div>
				{#if !device.current}<Button
						variant="danger"
						onclick={() => {
							revokeTarget = { id: device.id, name: device.name };
							revokeOpen = true;
						}}>Revoke</Button
					>{/if}
			</div>
		{/each}
	</section>
	<div class="actions">
		<Button variant="secondary" onclick={() => void refreshDevices()}>Refresh devices</Button
		><Button variant="secondary" onclick={() => void makeLink()}>Link a device</Button><Button
			variant="quiet"
			onclick={() => (signOutOpen = true)}>Sign out</Button
		>
	</div>
{/if}

<Sheet
	bind:open={linkOpen}
	title="Link a device"
	description="Scan this code or open the link on the device you want to add."
>
	<div class="link-content">
		{#if seconds > 0}
			<div class="qr" aria-label="Link QR code">
				{#if qr}<svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR code">
						{#each qr.data as row, y (y)}
							{#each row as dark, x (x)}{#if dark}<rect
										{x}
										{y}
										width="1"
										height="1"
										fill="var(--ht-code-ink)"
									/>{/if}{/each}
						{/each}
					</svg>{/if}
			</div>
			<p class="code">{linkCode}</p>
			<p class="url">{linkUrl(typeof window === 'undefined' ? '' : location.origin, linkCode)}</p>
			<p>Expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
		{:else}
			<p>This code has expired.</p>
			<Button onclick={() => void makeLink()}>New code</Button>
		{/if}
	</div>
</Sheet>
<ConfirmDialog
	bind:open={signOutOpen}
	title="Sign out?"
	message="Sign out of this device? Your records stay here. New changes stay on this device until you sign in again."
	confirmLabel="Sign out"
	danger
	onconfirm={() => auth.signOut()}
/>
<ConfirmDialog
	bind:open={revokeOpen}
	title={revokeTarget ? `Revoke ${revokeTarget.name}?` : 'Revoke device?'}
	message="It will be signed out and stop syncing. Its records stay on that device."
	confirmLabel="Revoke"
	danger
	onconfirm={async () => {
		if (revokeTarget) {
			await auth.revoke(revokeTarget.id);
			revokeTarget = null;
		}
	}}
/>

<style>
	header {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
		margin-bottom: var(--ht-space-5);
	}

	header :global(button) {
		flex: none;
		white-space: nowrap;
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	.intro,
	.signed {
		max-width: var(--ht-content-max);
		margin: 0 0 var(--ht-space-4);
		color: var(--ht-ink-2);
		font: var(--ht-type-body);
	}

	form {
		display: grid;
		gap: var(--ht-space-4);
		max-width: var(--ht-content-narrow);
		margin-top: var(--ht-space-4);
	}

	.key-input {
		width: 100%;
		min-width: 0;
		min-height: var(--ht-control-height);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		padding: var(--ht-space-2) var(--ht-space-3);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-body);
	}

	.key-input:focus-visible {
		outline: var(--ht-focus-width) solid var(--ht-ink);
		outline-offset: var(--ht-focus-offset);
	}

	section {
		max-width: var(--ht-content-max);
	}

	.device {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		padding: var(--ht-space-3) 0;
		border-bottom: var(--ht-hairline) solid var(--ht-line);
	}

	.device div {
		display: grid;
		gap: var(--ht-space-1);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.device strong {
		font: var(--ht-type-body-strong);
		color: var(--ht-ink);
	}

	.device span {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ht-space-3);
		margin-top: var(--ht-space-5);
	}

	.link-content {
		display: grid;
		justify-items: center;
		gap: var(--ht-space-3);
		text-align: center;
		color: var(--ht-ink-2);
		font: var(--ht-type-body);
	}

	.link-content p {
		margin: 0;
	}

	.qr {
		box-sizing: border-box;
		width: min(100%, var(--ht-code-size));
		aspect-ratio: 1;
		background: var(--ht-code-paper);
	}

	.qr :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.code {
		color: var(--ht-ink);
		font: var(--ht-type-figure);
	}

	.url {
		color: var(--ht-ink);
		overflow-wrap: anywhere;
		user-select: all;
	}
</style>
