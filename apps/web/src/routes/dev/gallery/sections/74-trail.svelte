<script lang="ts">
	import { TrailList } from '$lib/components/index.domain';
	import { formatClock, type TrailRow } from '$lib/components/trail';

	const HOUR = 3_600_000;
	const day = new Date(2026, 10, 12, 0, 0).getTime();
	const at = (hours: number) => day + hours * HOUR;
	const rows: TrailRow[] = [
		{
			kind: 'session',
			id: 'a',
			startLabel: '9:00 AM',
			endLabel: '10:30 AM',
			name: '库存管理系统开发',
			typeName: 'Work',
			typeColor: 'lake',
			placeName: '第1寺院',
			note: '修复洗手台 first\nsecond line hidden',
			durationLabel: '1h 30m',
			pending: true,
		},
		{
			kind: 'gap',
			id: 'g1',
			start: at(10.5),
			end: at(11),
			rangeLabel: `${formatClock(at(10.5))} to ${formatClock(at(11))}`,
			durationLabel: '30m',
		},
		{
			kind: 'session',
			id: 'b',
			startLabel: '11:00 AM',
			endLabel: '12:00 PM',
			name: null,
			typeName: 'Overhead',
			typeColor: 'rose',
			note: 'Team meeting about the quarterly plan',
			durationLabel: '1h 00m',
		},
		{
			kind: 'session',
			id: 'c',
			startLabel: '12:00 AM',
			endLabel: '1:15 AM',
			name: 'Night shift handover',
			typeName: 'Volunteer',
			typeColor: 'fern',
			durationLabel: '1h 15m',
			continuesFromPreviousDay: true,
		},
		{
			kind: 'session',
			id: 'd',
			startLabel: '11:30 PM',
			endLabel: null,
			name: 'Quarterly volunteer coordination and event preparation',
			typeName: 'Volunteer',
			typeColor: 'fern',
			placeName: 'Community hall, north wing',
			durationLabel: '30m',
			continuesNextDay: true,
			running: true,
		},
	];
	let added = $state('');
</script>

<section>
	<h2>Trail list</h2>
	<p class="caption">
		Sessions and gaps in order. Rows are not to scale; the ribbon gives the scale.
	</p>
	<p class="caption">Last gap to add: {added || 'none yet'}</p>
	<TrailList
		{rows}
		onselect={() => {}}
		onaddgap={(gap) => (added = `${formatClock(gap.start)} to ${formatClock(gap.end)}`)}
	/>
</section>
