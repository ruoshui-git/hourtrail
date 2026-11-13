<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Sheet, SyncBadge } from '$lib/components';
	import { sync } from '$lib/features/sync/engine.svelte';

	let open = $state(false);
	let copying = $state(false);
	let syncing = $state(false);
	const lastBackup = $derived(
		sync.lastSyncedAt === null
			? 'Not backed up yet'
			: `Last backed up: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(sync.lastSyncedAt)}`,
	);
	const rejected = $derived([...sync.rejected].sort((a, b) => b.at - a.at).slice(0, 20));
	const announcement = $derived(
		sync.status === 'local'
			? 'On this device only'
			: sync.status === 'synced'
				? 'Backed up'
				: sync.status === 'pending'
					? `${sync.pendingCount} changes waiting`
					: sync.status === 'offline'
						? "You're offline. Changes are saved on this device."
						: sync.status === 'error'
							? (sync.lastError ?? 'Sync problem')
							: 'Syncing',
	);

	function time(at: number) {
		return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at);
	}
	function label(entity: string) {
		return entity === 'session'
			? 'Session edit'
			: entity === 'work_item'
				? 'Work item edit'
				: `${entity} edit`;
	}
	async function copyDetails() {
		const details = rejected
			.map((entry) => `${label(entry.entity)}, ${time(entry.at)}: ${entry.reason}`)
			.join('\n');
		await navigator.clipboard.writeText(details);
		copying = true;
		setTimeout(() => (copying = false), 1500);
	}
	async function syncNow() {
		if (syncing) return;
		syncing = true;
		try {
			await sync.syncNow();
		} finally {
			syncing = false;
		}
	}
</script>

<SyncBadge state={sync.status} pendingCount={sync.pendingCount} onclick={() => (open = true)} />
<span class="ht-visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</span>
<Sheet bind:open title="Sync details" onclose={() => (open = false)}>
	<p>
		{sync.status === 'local'
			? 'Sign in to back up and sync your records.'
			: sync.status === 'synced'
				? 'Backed up'
				: sync.status === 'pending'
					? `${sync.pendingCount} ${sync.pendingCount === 1 ? 'change' : 'changes'} waiting`
					: sync.status === 'offline'
						? "You're offline. Your changes are saved on this device and will upload when you're back online."
						: 'Sync problem'}
	</p>
	{#if sync.status !== 'local'}<p>{lastBackup}</p>{/if}
	{#if sync.status === 'error'}
		<p role="alert">{sync.lastError ?? 'Sync could not be completed.'}</p>
		<Button variant="secondary" onclick={() => void syncNow()}>Try again</Button>
	{/if}
	{#if sync.status === 'local'}
		<a href={resolve('/settings/cloud')}>Cloud and devices</a>
	{:else}
		<Button disabled={syncing} onclick={() => void syncNow()}>
			{syncing ? 'Syncing…' : 'Sync now'}
		</Button>
	{/if}
	{#if rejected.length}
		<section>
			<h2>Not accepted by the cloud</h2>
			<ul>
				{#each rejected as entry (`${entry.mutation_id}:${entry.at}`)}
					<li>{label(entry.entity)}, {time(entry.at)}: {entry.reason}</li>
				{/each}
			</ul>
			<Button variant="quiet" onclick={() => void copyDetails()}
				>{copying ? 'Copied' : 'Copy details'}</Button
			>
		</section>
	{/if}
</Sheet>
