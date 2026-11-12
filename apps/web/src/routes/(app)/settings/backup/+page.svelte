<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { backupFileName, readSetting, serializeBackup } from '@hourtrail/core';
	import { Banner, Button, showToast } from '$lib/components';
	import { db, prepareLocalData } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { backupNudge } from '$lib/features/backup';
	import { deliverBackup, readBackup } from '$lib/features/backup/export';

	let now = $state(Date.now());
	let busy = $state(false);
	let error = $state('');
	const status = live(async () => {
		const value = (await db.local.get('last_backup_at'))?.value;
		const setting = await db.setting.get('reporting_tz');
		return {
			last: typeof value === 'number' && Number.isFinite(value) ? value : null,
			tz: readSetting('reporting_tz', setting?.deleted_at === null ? setting.value : undefined),
		};
	}, null);
	const nudge = $derived(backupNudge(status.current?.last ?? null, now));
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
		return () => clearInterval(timer);
	});

	async function download() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await prepareLocalData();
			const exportedAt = Date.now();
			const { backup, tz } = await readBackup(db, exportedAt);
			const file = new File([serializeBackup(backup)], backupFileName(exportedAt, tz), {
				type: 'application/json',
			});
			if (!(await deliverBackup(file))) return;
			await db.local.put({ key: 'last_backup_at', value: exportedAt });
			now = Date.now();
			showToast({ message: 'Backup saved.' });
		} catch {
			error = 'The backup could not be saved. Try downloading it again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Backup · Settings · Hourtrail</title></svelte:head>
<a href={resolve('/settings')}>Settings</a>
<h1>Backup</h1>
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
	{#if error}<Banner tone="danger" message={error} />{/if}
	<Button {busy} disabled={!status.current || !!status.error} onclick={download}>
		Download backup
	</Button>
	<p class="unavailable">Restoring from a backup comes with cloud sync.</p>
</section>

<style>
	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--ht-target);
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	h1 {
		margin: var(--ht-space-3) 0 var(--ht-space-5);
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
	}

	.unavailable {
		font: var(--ht-type-label);
		color: var(--ht-ink-3);
	}
</style>
