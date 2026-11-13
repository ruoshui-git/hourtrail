<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import { backupFileName, readSetting, serializeBackup } from '@hourtrail/core';
	import { Banner, Button, showToast } from '$lib/components';
	import { db, prepareLocalData } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import Restore from '$lib/features/backup/Restore.svelte';
	import { backupNudge } from '$lib/features/backup';
	import { deliverBackup, readBackup } from '$lib/features/backup/export';
	import { apiFetch, OfflineError } from '$lib/api/client';
	import { backupStatusSchema } from '@hourtrail/core';
	import { auth } from '$lib/features/cloud/auth.svelte';

	let now = $state(Date.now());
	let busy = $state(false);
	let restoring = $state(false);
	let error = $state('');
	let nightly = $state<{ last_nightly_at: number | null; dump: string | null } | null>(null);
	let nightlyLoaded = $state(false);
	let nightlyNow = $state(Date.now());
	const status = live(async () => {
		const value = (await db.local.get('last_backup_at'))?.value;
		const setting = await db.setting.get('reporting_tz');
		return {
			last: typeof value === 'number' && Number.isFinite(value) ? value : null,
			tz: readSetting('reporting_tz', setting?.deleted_at === null ? setting.value : undefined),
		};
	}, null);
	const nudge = $derived(backupNudge(status.current?.last ?? null, now));
	const nightlyWarning = $derived(
		nightly?.last_nightly_at !== null &&
			nightly?.last_nightly_at !== undefined &&
			nightlyNow - nightly.last_nightly_at > 48 * 60 * 60 * 1000,
	);
	const lastDate = $derived(
		status.current?.last !== null && status.current?.last !== undefined
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric',
					timeZone: status.current.tz ?? undefined,
				}).format(status.current.last)
			: null,
	);
	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		const nightlyTimer = setInterval(() => (nightlyNow = Date.now()), 60_000);
		return () => {
			clearInterval(timer);
			clearInterval(nightlyTimer);
		};
	});
	$effect(() => {
		if (auth.status !== 'signed-in' || nightlyLoaded) return;
		nightlyLoaded = true;
		void apiFetch('/api/backup/status', { schema: backupStatusSchema })
			.then((value) => {
				nightly = value;
			})
			.catch((cause: unknown) => {
				if (!(cause instanceof OfflineError)) nightly = null;
			});
	});

	async function download() {
		if (busy) return false;
		busy = true;
		error = '';
		try {
			await prepareLocalData();
			const exportedAt = Date.now();
			const { backup, tz } = await readBackup(db, exportedAt);
			const file = new File([serializeBackup(backup)], backupFileName(exportedAt, tz), {
				type: 'application/json',
			});
			if (!(await deliverBackup(file))) return false;
			await db.local.put({ key: 'last_backup_at', value: exportedAt });
			now = Date.now();
			showToast({ message: 'Backup saved.' });
			return true;
		} catch {
			error = 'The backup could not be saved. Try downloading it again.';
			return false;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Backup · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Backup</h1>
</header>
<section aria-label="Backup">
	<p>
		A backup file holds everything on this device. Keep it somewhere safe, such as Files or your
		computer.
	</p>
	{#if status.error}
		<Banner tone="danger" message="Backup details could not be loaded. Reload and try again." />
	{:else if status.current}
		<p>{lastDate ? `Last backup: ${lastDate}` : 'No backup yet'}</p>
		{#if nudge !== 'none'}
			<Banner
				tone="caution"
				message={nudge === 'missing'
					? "You haven't downloaded a backup yet."
					: 'Your last backup is more than 30 days old.'}
			/>
		{/if}
	{/if}
	{#if auth.status === 'signed-in' && nightly}
		<p>
			{nightly.last_nightly_at === null
				? 'No nightly backup yet'
				: `Last nightly backup: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(nightly.last_nightly_at)}`}
		</p>
		{#if nightlyWarning}
			<Banner tone="caution" message="The last nightly backup is more than 2 days old." />
		{/if}
	{/if}
	{#if error}<Banner tone="danger" message={error} />{/if}
	<Button {busy} disabled={restoring || !status.current || !!status.error} onclick={download}>
		Download backup
	</Button>
	<Restore
		saveBackup={download}
		saveError={error}
		disabled={busy || !status.current || !!status.error}
		bind:restoring
		tz={status.current?.tz ?? undefined}
	/>
</section>

<style>
	header {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
		margin-bottom: var(--ht-space-5);
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	section {
		display: grid;
		gap: var(--ht-space-5);
		max-width: var(--ht-content-max);
		justify-items: start;
		font: var(--ht-type-body);
		color: var(--ht-ink);
	}

	p {
		margin: 0;
		max-width: var(--ht-measure);
	}
</style>
