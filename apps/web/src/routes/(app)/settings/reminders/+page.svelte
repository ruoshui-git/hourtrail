<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import {
		readSetting,
		settingSchemas,
		pushKeyResponseSchema,
		pushSubscribeRequestSchema,
		pushUnsubscribeRequestSchema,
	} from '@hourtrail/core';
	import { Button, Field, Select, Switch } from '$lib/components';
	import { db, prepareLocalData, repo } from '$lib/db/app';
	import { apiFetch } from '$lib/api/client';
	import { auth } from '$lib/features/cloud/auth.svelte';
	import { emptyResponseSchema } from '$lib/features/reminders/push';

	let value = $state({ enabled: false, threshold_min: 240, repeat_min: null as number | null });
	let types = $state<{ id: string; name: string; remind: boolean }[]>([]);
	let signedIn = $state(false);
	let subscribed = $state(false);
	let busy = $state(false);
	let message = $state('');
	let thresholdChoice = $state('240');
	let repeatChoice = $state('once');
	onMount(() => {
		void load();
	});
	async function load() {
		await prepareLocalData();
		const [setting, activityTypes, state] = await Promise.all([
			db.setting.get('reminder'),
			db.activity_type.filter((x) => x.deleted_at === null).toArray(),
			db.local.get('push_state'),
		]);
		value = readSetting('reminder', setting?.value);
		thresholdChoice = String(value.threshold_min);
		repeatChoice = value.repeat_min === null ? 'once' : String(value.repeat_min);
		types = activityTypes.map((type) => ({ id: type.id, name: type.name, remind: type.remind }));
		subscribed = state?.value === true;
		await auth.refresh();
		signedIn = auth.status === 'signed-in';
	}
	async function save(next = value) {
		const current = await db.setting.get('reminder');
		const parsed = settingSchemas.reminder.parse(next);
		if (current) await repo.update('setting', 'reminder', { value: parsed });
		else await repo.create('setting', { id: 'reminder', value: parsed });
		value = parsed;
	}
	$effect(() => {
		const threshold = Number(thresholdChoice);
		if (threshold !== value.threshold_min && Number.isFinite(threshold))
			void save({ ...value, threshold_min: threshold });
	});
	$effect(() => {
		const repeat = repeatChoice === 'once' ? null : Number(repeatChoice);
		if (repeat !== value.repeat_min) void save({ ...value, repeat_min: repeat });
	});
	async function setType(id: string, remind: boolean) {
		const type = await db.activity_type.get(id);
		if (!type) return;
		await repo.update('activity_type', id, { remind });
		types = types.map((entry) => (entry.id === id ? { ...entry, remind } : entry));
	}
	async function turnOn() {
		message = '';
		if (Notification.permission === 'denied') {
			message =
				'Notifications are blocked for this app. Allow them in your device settings, then try again.';
			return;
		}
		busy = true;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				if (permission === 'denied')
					message =
						'Notifications are blocked for this app. Allow them in your device settings, then try again.';
				return;
			}
			const { public_key } = await apiFetch('/api/push/key', { schema: pushKeyResponseSchema });
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: decodeKey(public_key),
			});
			const json = subscription.toJSON();
			const payload = pushSubscribeRequestSchema.parse({
				endpoint: json.endpoint,
				keys: json.keys,
			});
			await apiFetch('/api/push/subscribe', { body: payload, schema: emptyResponseSchema });
			await db.local.put({ key: 'push_state', value: true });
			subscribed = true;
		} catch {
			message = 'Could not turn on notifications. Try again.';
		} finally {
			busy = false;
		}
	}
	async function turnOff() {
		busy = true;
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				await apiFetch('/api/push/subscribe', {
					method: 'DELETE',
					body: pushUnsubscribeRequestSchema.parse({ endpoint: subscription.endpoint }),
					schema: emptyResponseSchema,
				});
				await subscription.unsubscribe();
			}
			await db.local.put({ key: 'push_state', value: false });
			subscribed = false;
		} catch {
			message = 'Could not turn off notifications. Try again.';
		} finally {
			busy = false;
		}
	}
	function decodeKey(key: string) {
		const padded = key.replace(/-/g, '+').replace(/_/g, '/');
		return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
	}
</script>

<svelte:head><title>Reminders · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Reminders</h1>
</header>
<section class="settings-card">
	<Switch
		label="Remind me about a session left running"
		checked={value.enabled}
		onchange={(enabled) => void save({ ...value, enabled })}
	/>
	<Field label="After"
		>{#snippet children(props)}<Select
				{...props}
				bind:value={thresholdChoice}
				options={[1, 2, 3, 4, 6, 8, 12].map((hours) => ({
					value: String(hours * 60),
					label: `${hours} hour${hours === 1 ? '' : 's'}`,
				}))}
			/>{/snippet}</Field
	>
	<Field label="Repeat"
		>{#snippet children(props)}<Select
				{...props}
				bind:value={repeatChoice}
				options={[
					{ value: 'once', label: 'Once' },
					{ value: '30', label: 'Every 30 minutes' },
					{ value: '60', label: 'Every hour' },
					{ value: '120', label: 'Every 2 hours' },
				]}
			/>{/snippet}</Field
	>
	<h2>Remind for these types</h2>
	{#each types as type (type.id)}<Switch
			label={type.name}
			checked={type.remind}
			onchange={(checked) => void setType(type.id, checked)}
		/>{/each}
	<h2>Notifications on this device</h2>
	{#if !signedIn}<p>Sign in to get reminders on this device.</p>
	{:else if subscribed}<p>Notifications are on for this device</p>
		<Button variant="secondary" disabled={busy} onclick={turnOff}>Turn off</Button>
	{:else}<Button variant="secondary" disabled={busy} onclick={turnOn}>Turn on notifications</Button
		>{/if}
	<p>
		On iPhone, notifications work only in the app added to the Home Screen. A session must have
		synced for the cloud to remind you, and delivery is best effort.
	</p>
	{#if message}<p role="status">{message}</p>{/if}
</section>

<style>
	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	header {
		margin-bottom: var(--ht-space-5);
	}

	.settings-card {
		max-width: var(--ht-content-max);
		display: grid;
		gap: var(--ht-space-3);
	}

	h2 {
		margin: var(--ht-space-4) 0 0;
		font: var(--ht-type-heading);
		color: var(--ht-ink);
	}

	p {
		margin: 0;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}
</style>
