<script lang="ts">
	import { DayRibbon } from '$lib/components/index.domain';
	import { formatClock } from '$lib/components/trail';
	import type { RibbonSegment } from '$lib/components/trail';

	const HOUR = 3_600_000;
	const midnight = new Date(2026, 10, 12, 0, 0).getTime();
	const ticks = [
		{ at: 0, label: '12a' },
		{ at: 6 * HOUR, label: '6a' },
		{ at: 12 * HOUR, label: '12p' },
		{ at: 18 * HOUR, label: '6p' },
	].map((tick) => ({ ...tick, at: midnight + tick.at }));

	// Segment times are offsets from midnight in hours, so the labels stay readable.
	function segment(
		id: string,
		from: number,
		to: number | null,
		color: RibbonSegment['color'],
		name: string,
	): RibbonSegment {
		const start = midnight + from * HOUR;
		const end = to === null ? null : midnight + to * HOUR;
		const label = `${name}, ${formatClock(start)}${end === null ? ' onwards' : ` to ${formatClock(end)}`}`;
		return { id, start, end, color, label };
	}
	const segments = [
		segment('morning', 9, 12.5, 'lake', 'Work'),
		segment('afternoon', 13, 14, 'rose', 'Overhead'),
		segment('evening', 19, 20.5, 'fern', 'Volunteer'),
	];
	const runningSegments = [...segments, segment('running', 15, null, 'lake', 'Work')];
	const noop = () => {};
	const now = midnight + 16.1 * HOUR;
</script>

<section>
	<h2>Day ribbon</h2>
	<p class="caption">
		Proportional to the real length of the day. Running segments end at now. The tick shows only
		inside the day.
	</p>
	<div class="stack">
		<div class="sample">
			<p class="caption">Normal day, 24 hours, running session</p>
			<DayRibbon
				dayStart={midnight}
				dayEnd={midnight + 24 * HOUR}
				segments={runningSegments}
				{ticks}
				{now}
				onselect={noop}
			/>
		</div>
		<div class="sample">
			<p class="caption">23-hour day (clocks go forward)</p>
			<DayRibbon
				dayStart={midnight}
				dayEnd={midnight + 23 * HOUR}
				segments={runningSegments}
				{ticks}
				{now}
				onselect={noop}
			/>
		</div>
		<div class="sample">
			<p class="caption">25-hour day (clocks go back)</p>
			<DayRibbon
				dayStart={midnight}
				dayEnd={midnight + 25 * HOUR}
				segments={runningSegments}
				{ticks}
				{now}
				onselect={noop}
			/>
		</div>
		<div class="sample">
			<p class="caption">Viewing a past day: no now tick</p>
			<DayRibbon
				dayStart={midnight - 24 * HOUR}
				dayEnd={midnight}
				{segments}
				{ticks}
				{now}
				onselect={noop}
			/>
		</div>
	</div>
</section>
