<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import {
		dayOf,
		formatHours,
		monthBounds,
		readSetting,
		statistics,
		type Day,
		type ReportData,
		type SettingKey,
	} from '@hourtrail/core';
	import {
		BarChart,
		DataTable,
		DateInput,
		EmptyState,
		Field,
		IconButton,
		SegmentedControl,
		StatTile,
	} from '$lib/components';
	import { db } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import Breakdowns from '$lib/features/reports/Breakdowns.svelte';
	import {
		breakdownItems,
		chartBars,
		chartSeries,
		customProblem,
		parseUnit,
		periodTable as buildPeriodTable,
		rangeTitle,
		shiftRange,
		toStatsRange,
		type ReportRange,
	} from '$lib/features/reports/domain';

	const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const EMPTY: ReportData = {
		sessions: [],
		work_items: [],
		projects: [],
		types: [],
		places: [],
		settings: {},
	};

	// Read from Dexie only; settings come from the synced setting rows (tombstones skipped).
	const data = live(
		async () => {
			const [sessions, work_items, projects, types, places, settings] = await Promise.all([
				db.session.toArray(),
				db.work_item.toArray(),
				db.project.toArray(),
				db.activity_type.toArray(),
				db.place.toArray(),
				db.setting.toArray(),
			]);
			const stored: Partial<Record<SettingKey, unknown>> = {};
			for (const row of settings) {
				if (row.deleted_at === null) stored[row.id as SettingKey] = row.value;
			}
			const reporting = readSetting('reporting_tz', stored.reporting_tz) ?? deviceZone;
			return {
				loaded: true,
				data: {
					sessions,
					work_items,
					projects,
					types,
					places,
					settings: { ...stored, reporting_tz: reporting },
				} satisfies ReportData,
			};
		},
		{ loaded: false, data: EMPTY },
	);

	// The clock ticks each minute so running sessions count up while they run.
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	const reportData = $derived(data.current.data);
	const zone = $derived(
		readSetting('reporting_tz', reportData.settings.reporting_tz) ?? deviceZone,
	);
	const format = $derived(readSetting('duration_format', reportData.settings.duration_format));
	const fallbackColor = $derived(reportData.types[0]?.color ?? 'bark');
	const today = $derived(dayOf(now, zone));

	let unitChoice = $state('month');
	const unit = $derived(parseUnit(unitChoice));
	// Anchor day for Day, Week and Month; null means today.
	let anchor = $state<Day | null>(null);
	let customFrom = $state('');
	let customTo = $state('');

	// Opening Custom starts from the month being viewed, so the fields are never blank.
	$effect(() => {
		if (unit === 'custom' && customFrom === '') {
			const bounds = monthBounds(anchor ?? today);
			customFrom = bounds.first;
			customTo = bounds.last;
		}
	});

	const customError = $derived(unit === 'custom' ? customProblem(customFrom, customTo) : null);
	const range = $derived<ReportRange | null>(
		unit === 'custom'
			? customError === null
				? { unit: 'custom', from: customFrom, to: customTo }
				: null
			: { unit, day: anchor ?? today },
	);
	const statsRange = $derived(range === null ? null : toStatsRange(range));
	const stats = $derived(
		data.current.loaded && statsRange !== null
			? statistics(statsRange, reportData, { now, includeRunning: true })
			: null,
	);
	// Each type's own statistics, used only to pick a breakdown row's colour (its main type).
	const perType = $derived(
		stats !== null && statsRange !== null
			? reportData.types.map((type) => ({
					color: type.color,
					stats: statistics(
						statsRange,
						{
							...reportData,
							sessions: reportData.sessions.filter((session) => session.type_id === type.id),
						},
						{ now, includeRunning: true },
					),
				}))
			: [],
	);

	const noun = $derived(unit === 'custom' ? 'period' : unit);
	const otherTypes = $derived(
		stats === null ? [] : stats.by_type.filter((type) => !type.counts_as_work && type.minutes > 0),
	);
	const series = $derived(
		stats === null ? [] : chartSeries(stats, reportData.types, fallbackColor),
	);
	const bars = $derived(stats === null ? [] : chartBars(stats));
	const periodTable = $derived(
		stats === null
			? { columns: [], rows: [], footer: {} }
			: buildPeriodTable(stats, series, format),
	);
	const breakdownSets = $derived(
		stats === null
			? []
			: [
					{
						value: 'work_items',
						label: 'Work items',
						title: 'Time by work item',
						items: breakdownItems(stats, 'by_work_item', perType, fallbackColor),
					},
					{
						value: 'projects',
						label: 'Projects',
						title: 'Time by project',
						items: breakdownItems(stats, 'by_project', perType, fallbackColor),
					},
					{
						value: 'places',
						label: 'Places',
						title: 'Time by place',
						items: breakdownItems(stats, 'by_place', perType, fallbackColor),
					},
				],
	);

	function step(direction: 1 | -1) {
		if (range === null) return;
		const next = shiftRange(range, direction);
		if (next.unit === 'custom') {
			customFrom = next.from;
			customTo = next.to;
		} else {
			anchor = next.day;
		}
	}
</script>

<svelte:head><title>Reports · Hourtrail</title></svelte:head>
<section class="reports">
	<header><h1>Reports</h1></header>

	<SegmentedControl
		label="Range"
		bind:value={unitChoice}
		options={[
			{ value: 'day', label: 'Day' },
			{ value: 'week', label: 'Week' },
			{ value: 'month', label: 'Month' },
			{ value: 'custom', label: 'Custom' },
		]}
	/>

	{#if unit === 'custom'}
		<div class="custom">
			<Field label="From">
				{#snippet children(props)}<DateInput {...props} bind:value={customFrom} />{/snippet}
			</Field>
			<Field label="To" error={customError ?? undefined}>
				{#snippet children(props)}<DateInput {...props} bind:value={customTo} />{/snippet}
			</Field>
		</div>
	{/if}

	<div class="period">
		<IconButton
			label={`Previous ${noun}`}
			icon={ChevronLeft}
			variant="secondary"
			disabled={range === null}
			onclick={() => step(-1)}
		/>
		<h2>{stats === null ? 'Custom range' : rangeTitle(stats.range, unit)}</h2>
		<IconButton
			label={`Next ${noun}`}
			icon={ChevronRight}
			variant="secondary"
			disabled={range === null}
			onclick={() => step(1)}
		/>
	</div>

	{#if stats !== null && stats.session_count === 0}
		<EmptyState message="No time recorded in this range." />
	{:else if stats !== null}
		<div class="results">
			<div class="overview">
				<div class="figures">
					<StatTile label="Work hours" value={formatHours(stats.work_minutes, format)} />
					{#each otherTypes as type (type.type_id)}
						<div class="minor">
							<StatTile label={type.name} value={formatHours(type.minutes, format)} size="md" />
						</div>
					{/each}
					<div class="minor">
						<StatTile label="Sessions" value={String(stats.session_count)} size="md" />
					</div>
				</div>
				<BarChart
					title={stats.bar_unit === 'day' ? 'Time by day' : 'Time by week'}
					{series}
					{bars}
					{format}
					showTable={false}
				/>
				<DataTable
					caption={stats.bar_unit === 'day'
						? 'Days with recorded time'
						: 'Weeks with recorded time'}
					columns={periodTable.columns}
					rows={periodTable.rows}
					footer={periodTable.footer}
				/>
			</div>
			<Breakdowns sets={breakdownSets} {format} />
		</div>
	{/if}

	<div class="create">
		<!-- /reports/new is built in task 4.3, so it is not in the typed route list yet. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="create-link" href="/reports/new">Create report</a>
	</div>
</section>

<style>
	.reports {
		max-width: var(--ht-content-max);
		display: grid;
		gap: var(--ht-space-5);
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
	}

	h2 {
		margin: 0;
		font: var(--ht-type-heading);
		color: var(--ht-ink);
		text-align: center;
		min-width: 0;
	}

	.custom {
		display: grid;
		gap: var(--ht-space-3);
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.period {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--ht-space-3);
	}

	.results {
		display: grid;
		gap: var(--ht-space-6);
	}

	.overview {
		display: grid;
		gap: var(--ht-space-5);
		min-width: 0;
	}

	.figures {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--ht-space-5);
	}

	/* Other types and sessions read smaller than the headline figure. */

	.create {
		justify-self: start;
	}

	.create-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--ht-target);
		min-height: var(--ht-button-md);
		padding: var(--ht-space-2) var(--ht-space-4);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
		text-decoration: none;
	}

	@media (hover: hover) {
		.create-link:hover {
			background: var(--ht-hover);
		}
	}

	.create-link:active {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}

	@media (width >= 1024px) {
		.results {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
		}
	}
</style>
