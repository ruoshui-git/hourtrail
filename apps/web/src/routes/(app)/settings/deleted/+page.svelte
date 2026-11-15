<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import { sessionMinutes } from '@hourtrail/core';
	import type { RecordOf } from '@hourtrail/core';
	import { Button, EmptyState, showToast } from '$lib/components';
	import { db, repo } from '$lib/db/app';
	import { formatMinutes } from '$lib/format';
	import { live } from '$lib/live.svelte';

	type DeletedSession = RecordOf<'session'>;
	const rows = live(
		async () => {
			const sessions = await db.session.toArray();
			const deleted = sessions
				.filter((session) => session.deleted_at !== null)
				.sort((a, b) => b.deleted_at! - a.deleted_at!);
			const items = await db.work_item.toArray();
			const names = new Map(items.map((item) => [item.id, item.name]));
			return deleted.map((session) => ({
				session,
				name: session.work_item_id
					? (names.get(session.work_item_id) ?? 'Untitled session')
					: 'Untitled session',
			}));
		},
		[] as { session: DeletedSession; name: string }[],
	);
	let shown = $state(50);
	const visible = $derived(rows.current.slice(0, shown));
	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
	function duration(session: DeletedSession) {
		return formatMinutes(sessionMinutes(session.start_at, session.end_at ?? Date.now()));
	}
	async function restore(id: string) {
		await repo.restore('session', id);
		showToast({ message: 'Session restored.' });
	}
</script>

<svelte:head><title>Deleted sessions · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Deleted sessions</h1>
</header>
<section aria-label="Deleted sessions">
	{#if rows.error}
		<p role="alert">Deleted sessions could not be loaded. Reload and try again.</p>
	{:else if rows.current.length === 0}
		<EmptyState message="No deleted sessions." />
	{:else}
		<ul>
			{#each visible as row (row.session.id)}
				<li>
					<div class="details">
						<strong>{row.name}</strong>
						<span
							>{dateFormat.format(row.session.start_at)}, {timeFormat.format(
								row.session.start_at,
							)}–{row.session.end_at === null ? 'now' : timeFormat.format(row.session.end_at)}</span
						>
						<span>{duration(row.session)}</span>
					</div>
					<Button variant="secondary" onclick={() => void restore(row.session.id)}>Restore</Button>
				</li>
			{/each}
		</ul>
		{#if shown < rows.current.length}<Button variant="quiet" onclick={() => (shown += 50)}
				>Show more</Button
			>{/if}
	{/if}
</section>

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
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
		color: var(--ht-ink);
	}

	section {
		display: grid;
		gap: var(--ht-space-3);
		max-width: var(--ht-content-max);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		padding-block: var(--ht-space-3);
		border-bottom: var(--ht-hairline) solid var(--ht-line);
	}

	.details {
		display: grid;
		gap: var(--ht-space-1);
		min-width: 0;
	}

	strong {
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
		overflow-wrap: anywhere;
	}

	.details span {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	li :global(button) {
		flex: none;
	}
</style>
