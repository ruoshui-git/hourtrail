<script lang="ts">
	import { GapRow, ReviewItem, WorkItemRow } from '$lib/components/index.domain';
	const noop = () => {};
</script>

<section>
	<h2>Rows</h2>
	<div class="columns">
		<div class="stack">
			<h3>Work item rows</h3>
			<WorkItemRow
				name="库存管理系统开发"
				typeColor="lake"
				typeName="Work"
				projectName="Inventory Software"
				pinned
				onstart={noop}
				onopen={noop}
			/>
			<WorkItemRow
				name="修复洗手台"
				typeColor="saffron"
				typeName="Volunteer"
				pending
				onstart={noop}
				onopen={noop}
			/>
			<WorkItemRow
				name="Quarterly volunteer coordination and event preparation"
				typeColor="fern"
				typeName="Volunteer"
				projectName="Community hall"
				onstart={noop}
				onopen={noop}
			/>
			<WorkItemRow
				name="Building maintenance"
				typeColor="slate"
				typeName="Overhead"
				disabled
				onstart={noop}
				onopen={noop}
			/>
		</div>
		<div class="stack">
			<h3>Gap rows</h3>
			<GapRow durationLabel="1h 30m" rangeLabel="10:30 AM to 12:00 PM" onadd={noop} />
			<GapRow durationLabel="25m" rangeLabel="4:05 PM to 4:30 PM" onadd={noop} />
			<h3>Review items</h3>
			<ReviewItem
				tone="caution"
				message="Two sessions overlap at 2:00 PM."
				detail="Work and Overhead, 1h 00m shared."
				actions={[
					{ label: 'Shorten Overhead', onclick: noop },
					{ label: 'Split at 2:00 PM', onclick: noop },
				]}
				onreviewed={noop}
				ondismiss={noop}
			/>
			<ReviewItem
				message="A session has no place although the others on this day do."
				onreviewed={noop}
				ondismiss={noop}
			/>
			<ReviewItem
				message="Two sessions overlap at 2:00 PM."
				actions={[{ label: 'Split at 2:00 PM', onclick: noop }]}
				onreviewed={noop}
				ondismiss={noop}
				state="reviewed"
			/>
			<ReviewItem
				tone="caution"
				message="A session runs longer than 12 hours."
				onreviewed={noop}
				ondismiss={noop}
				state="dismissed"
			/>
		</div>
	</div>
</section>
