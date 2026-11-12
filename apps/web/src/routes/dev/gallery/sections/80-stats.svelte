<script lang="ts">
	import { DataTable, HBarList, StatTile, formatMinutes } from '$lib/components/index.charts';

	const days = [
		{ day: 'Mon 3', work: 330, overhead: 45, volunteer: 0 },
		{ day: 'Tue 4', work: 420, overhead: 30, volunteer: 90 },
		{ day: 'Wed 5', work: 285, overhead: 60, volunteer: 0 },
	];
	const total = (key: 'work' | 'overhead' | 'volunteer') =>
		days.reduce((sum, day) => sum + day[key], 0);
	const footer = {
		day: 'Total',
		work: formatMinutes(total('work')),
		overhead: formatMinutes(total('overhead')),
		volunteer: formatMinutes(total('volunteer')),
	};
	const rows = days.map((day) => ({
		day: day.day,
		work: formatMinutes(day.work),
		overhead: formatMinutes(day.overhead),
		volunteer: formatMinutes(day.volunteer),
	}));
</script>

<section>
	<h2>Statistics</h2>
	<p class="caption">Stat tiles, ranked bars and tables. Figures use the display face.</p>
	<div class="tiles">
		<StatTile label="Work hours" value="38h 20m" />
		<StatTile label="Overhead" value="4h 05m" />
		<StatTile label="Volunteer" value="6h 30m" />
	</div>
	<div class="stack">
		<h3>Work items</h3>
		<HBarList
			title="Work items by time"
			items={[
				{
					id: 'a',
					label: '库存管理系统开发',
					secondary: 'Work at 第1寺院',
					color: 'lake',
					minutes: 1480,
				},
				{ id: 'b', label: '修复洗手台', secondary: 'Overhead', color: 'rose', minutes: 310 },
				{
					id: 'c',
					label: 'Building Maintenance',
					secondary: 'Volunteer',
					color: 'saffron',
					minutes: 225,
				},
				{
					id: 'd',
					label: 'Quarterly volunteer coordination and event preparation',
					secondary: 'Volunteer',
					color: 'fern',
					minutes: 95,
				},
			]}
		/>
	</div>
	<div class="stack">
		<h3>Days</h3>
		<DataTable
			caption="Hours by day"
			columns={[
				{ key: 'day', label: 'Day' },
				{ key: 'work', label: 'Work', numeric: true },
				{ key: 'overhead', label: 'Overhead', numeric: true },
				{ key: 'volunteer', label: 'Volunteer', numeric: true },
			]}
			{rows}
			{footer}
		/>
	</div>
</section>

<style>
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ht-space-5) var(--ht-space-6);
	}

	h3 {
		font: var(--ht-type-body-strong);
	}
</style>
