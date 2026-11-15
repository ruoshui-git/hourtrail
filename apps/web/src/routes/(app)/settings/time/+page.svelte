<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import { readSetting } from '@hourtrail/core';
	import { Button, Field, SegmentedControl, TextInput, showToast } from '$lib/components';
	import { db, repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { formatZoneOffset, searchZones } from '$lib/features/settings/time/domain';

	const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	const zones =
		typeof Intl.supportedValuesOf === 'function'
			? Intl.supportedValuesOf('timeZone')
			: [deviceZone];
	let query = $state('');
	let now = $state(Date.now());
	const settings = live(
		async () => ({
			time: await db.setting.get('reporting_tz'),
			week: await db.setting.get('week_start'),
			loaded: true,
		}),
		{ time: undefined, week: undefined, loaded: false },
	);
	const zone = $derived(
		readSetting(
			'reporting_tz',
			settings.current.time?.deleted_at === null ? settings.current.time.value : undefined,
		) ?? deviceZone,
	);
	let weekChoice = $state('1');
	let weekInitialized = false;
	$effect(() => {
		if (!settings.current.loaded) return;
		const stored = settings.current.week;
		const value =
			stored && stored.deleted_at === null ? readSetting('week_start', stored.value) : 1;
		if (!weekInitialized) {
			weekChoice = String(value);
			weekInitialized = true;
		} else if (Number(weekChoice) !== value) void save('week_start', Number(weekChoice));
	});
	const matches = $derived(searchZones(zones, query).slice(0, 100));

	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	async function save(key: 'reporting_tz' | 'week_start', value: string | number) {
		const row = await db.setting.get(key);
		if (key === 'reporting_tz') {
			if (row && row.deleted_at === null)
				await repo.update('setting', key, { value: value as string });
			else await repo.create('setting', { id: key, value: value as string | null });
		} else {
			if (row && row.deleted_at === null)
				await repo.update('setting', key, { value: value as 1 | 2 | 3 | 4 | 5 | 6 | 7 });
			else await repo.create('setting', { id: key, value: value as 1 | 2 | 3 | 4 | 5 | 6 | 7 });
		}
		if (key === 'reporting_tz') showToast({ message: `Days are now counted in ${value}.` });
	}
</script>

<svelte:head><title>Time zone and week start · Settings · Hourtrail</title></svelte:head>
<header>
	<Button variant="quiet" icon={ChevronLeft} onclick={() => goto(resolve('/settings'))}
		>Settings</Button
	>
	<h1>Time zone and week start</h1>
</header>
<section>
	<div class="field">
		<h2>Reporting time zone</h2>
		<p class="current-zone">{zone} <span>{formatZoneOffset(zone, now)}</span></p>
		<p>Days in History, Statistics and reports are counted in this time zone.</p>
		{#if deviceZone !== zone}
			<Button variant="quiet" onclick={() => void save('reporting_tz', deviceZone)}
				>Use this device's time zone ({deviceZone})</Button
			>
		{/if}
	</div>
	<Field label="Search time zones"
		>{#snippet children({ id, describedBy, invalid })}<TextInput
				{id}
				{describedBy}
				{invalid}
				bind:value={query}
				placeholder="Search by city or region"
			/>{/snippet}</Field
	>
	<ul aria-label="Time zones">
		{#each matches as item (item)}
			<li>
				<button
					class="zone"
					aria-current={zone === item ? 'true' : undefined}
					onclick={() => void save('reporting_tz', item)}
					><span>{item}</span><span>{formatZoneOffset(item, now)}</span></button
				>
			</li>
		{/each}
		{#if matches.length === 0}<li class="empty">No matching time zones.</li>{/if}
	</ul>
	<div class="field week">
		<h2>Week starts on</h2>
		<SegmentedControl
			bind:value={weekChoice}
			label="Week starts on"
			options={[
				{ value: '1', label: 'Monday' },
				{ value: '7', label: 'Sunday' },
			]}
		/>
	</div>
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
		gap: var(--ht-space-5);
		max-width: var(--ht-content-max);
	}

	.field {
		display: grid;
		gap: var(--ht-space-2);
	}

	h2 {
		margin: 0;
		font: var(--ht-type-heading);
		color: var(--ht-ink);
	}

	p {
		margin: 0;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.current-zone {
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
	}

	.current-zone span {
		margin-left: var(--ht-space-2);
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	ul {
		max-height: calc(var(--ht-space-8) * 6);
		overflow: auto;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: var(--ht-hairline) solid var(--ht-line);
	}

	.zone {
		display: flex;
		justify-content: space-between;
		gap: var(--ht-space-3);
		align-items: center;
		width: 100%;
		min-height: var(--ht-target);
		padding: var(--ht-space-2) 0;
		border: 0;
		border-bottom: var(--ht-hairline) solid var(--ht-line);
		background: transparent;
		color: var(--ht-ink);
		text-align: left;
		font: var(--ht-type-label);
	}

	.zone span:last-child {
		color: var(--ht-ink-2);
		white-space: nowrap;
	}

	.zone[aria-current='true'] {
		font-weight: var(--ht-weight-strong);
	}

	.zone:focus-visible {
		outline: var(--ht-focus-width) solid var(--ht-ink);
		outline-offset: var(--ht-focus-offset);
	}

	.empty {
		padding-block: var(--ht-space-4);
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}
</style>
