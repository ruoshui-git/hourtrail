<script lang="ts">
	import { RunningPanel } from '$lib/components/index.domain';

	// Fixed clock so the screenshots are repeatable: started 4:02 AM, 2h 14m 07s ago.
	const startAt = new Date(2026, 10, 12, 4, 2, 0).getTime();
	const now = startAt + 8047000;
	const noop = () => {};
</script>

<section>
	<h2>Running panel</h2>
	<p class="caption">
		The one bold thing on Home. Elapsed time is computed from the start, not counted.
	</p>
	<div class="columns">
		<RunningPanel
			typeName="Work"
			typeColor="lake"
			workItemName="库存管理系统开发"
			{startAt}
			placeName="第1寺院"
			{now}
			onstop={noop}
			onswitch={noop}
			ontypeclick={noop}
			onnameclick={noop}
		/>
		<RunningPanel
			typeName="Work"
			typeColor="lake"
			workItemName={null}
			{startAt}
			{now}
			onstop={noop}
			onswitch={noop}
			onname={noop}
		/>
		<RunningPanel
			typeName="Volunteer"
			typeColor="fern"
			workItemName="Quarterly volunteer coordination and event preparation"
			{startAt}
			placeName="Community hall, north wing"
			{now}
			onstop={noop}
			onswitch={noop}
		/>
		<RunningPanel
			typeName="Overhead"
			typeColor="rose"
			workItemName="Building maintenance"
			{startAt}
			{now}
			busy
			onstop={noop}
			onswitch={noop}
		/>
	</div>
</section>
