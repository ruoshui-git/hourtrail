<script lang="ts">
	import { BarChart, type ChartBar, type ChartSeries } from '$lib/components/index.charts';

	const series: ChartSeries[] = [
		{ key: 'work', label: 'Work', color: 'lake' },
		{ key: 'overhead', label: 'Overhead', color: 'rose' },
		{ key: 'volunteer', label: 'Volunteer', color: 'saffron' },
		{ key: 'personal', label: 'Personal', color: 'fern' },
	];

	// Minutes per type. Wednesday is empty to show the zero column.
	const week: ChartBar[] = [
		{ id: 'mon', label: 'Mon', values: { work: 330, overhead: 45, personal: 60 } },
		{ id: 'tue', label: 'Tue', values: { work: 420, overhead: 30, volunteer: 90, personal: 20 } },
		{ id: 'wed', label: 'Wed', values: {} },
		{ id: 'thu', label: 'Thu', values: { work: 285, overhead: 60, personal: 40 } },
		{ id: 'fri', label: 'Fri', values: { work: 510, volunteer: 120 } },
		{ id: 'sat', label: 'Sat', values: { volunteer: 240, personal: 130 } },
		{ id: 'sun', label: 'Sun', values: { overhead: 25, personal: 75 } },
	];

	const weeks: ChartBar[] = Array.from({ length: 12 }, (_, index) => {
		const day = new Date(Date.UTC(2026, 8, 7 + index * 7));
		return {
			id: `w${index}`,
			label: `${day.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${day.getUTCDate()}`,
			values: {
				work: 1200 + ((index * 137) % 9) * 60,
				overhead: 180 + ((index * 53) % 5) * 45,
				volunteer: ((index * 29) % 4) * 90,
				personal: 240 + ((index * 61) % 6) * 30,
			},
		};
	});
</script>

<section>
	<h2>Charts</h2>
	<p class="caption">
		Stacked columns by activity type. Hover or tab to a column for its values; the table below every
		chart has the same numbers.
	</p>
	<div class="stack">
		<h3>This week</h3>
		<BarChart title="Hours by day this week" {series} bars={week} />
	</div>
	<div class="stack">
		<h3>Twelve weeks, compact</h3>
		<BarChart title="Hours by week, last twelve weeks" {series} bars={weeks} height="compact" />
	</div>
	<div class="stack">
		<h3>Nothing recorded</h3>
		<BarChart title="Hours by day, empty range" {series} bars={[]} />
	</div>
</section>

<style>
	h3 {
		font: var(--ht-type-body-strong);
	}
</style>
