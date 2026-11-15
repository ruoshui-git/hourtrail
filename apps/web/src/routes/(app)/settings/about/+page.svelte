<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import { Button } from '$lib/components';
	import { persistenceState } from '$lib/pwa/persist';
	import { auth } from '$lib/features/cloud/auth.svelte';
	import { sync } from '$lib/features/sync/engine.svelte';
	import { formatStorageUsage } from '$lib/features/settings/about/build';
	import { BUILD_COMMIT, BUILD_TIME, BUILD_VERSION } from '$lib/build-info';
	const builtDate = new Date(BUILD_TIME);
	const builtAt = Number.isNaN(builtDate.getTime())
		? BUILD_TIME
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
				builtDate,
			);

	let storage = $state<{
		usage?: number;
		persistence: 'persisted' | 'denied' | 'unsupported';
	} | null>(null);
	const backupLabel = $derived(
		sync.lastSyncedAt === null
			? 'Not backed up yet'
			: `Last backed up: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(sync.lastSyncedAt)}`,
	);
	onMount(async () => {
		const persistence = await persistenceState();
		let usage: number | undefined;
		try {
			usage = (await navigator.storage.estimate()).usage;
		} catch {
			/* browser storage estimate is optional */
		}
		storage = { usage, persistence };
	});
</script>

<svelte:head><title>About · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>About</h1>
</header>
<section aria-label="About Hourtrail">
	<h2>Hourtrail</h2>
	<p>Version {BUILD_VERSION} · build {BUILD_COMMIT} · {builtAt}</p>
	<p>
		Storage: {storage
			? `${formatStorageUsage(storage.usage)} · ${storage.persistence === 'persisted' ? 'kept by the browser' : 'may be cleared by the browser'}`
			: 'Checking storage…'}
	</p>
	<p>
		{auth.status === 'signed-in'
			? `Signed in as ${auth.device?.name ?? 'this device'}`
			: 'On this device only'}
	</p>
	<p>{backupLabel}</p>
	<p>A personal time tracker. Your records stay on your devices and your own cloud.</p>
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

	h2 {
		margin: 0;
		color: var(--ht-ink);
		font: var(--ht-type-heading);
	}

	p {
		margin: 0;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}
</style>
