<script lang="ts">
	import { Switch, Stepper, SegmentedControl, FilterChip } from '$lib/components';
	const options = [
		{ value: 'day', label: 'Day' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
	];
</script>

<section>
	<h2>Choices</h2>
	<div class="columns">
		<Switch label="Capture place" hint="Add a place when a session starts." checked /><Switch
			label="Keep raw coordinates"
		/><Switch
			label="Reminders unavailable"
			hint="Link a device to enable reminders."
			disabled
		/><Switch label="Cloud backup enabled" checked disabled /><Switch
			label="Quarterly volunteer coordination and event preparation"
		/>
	</div>
	<div class="columns">
		<Stepper
			label="Reminder interval"
			value={30}
			min={5}
			max={60}
			step={5}
			unit="minutes"
		/><Stepper
			label="Minimum interval"
			value={5}
			min={5}
			max={60}
			step={5}
			unit="minutes"
		/><Stepper
			label="Maximum interval"
			value={60}
			min={5}
			max={60}
			step={5}
			unit="minutes"
		/><Stepper label="Reminder interval unavailable" value={30} unit="minutes" disabled />
	</div>
	<div class="stack">
		<SegmentedControl label="Report range" {options} value="day" /><SegmentedControl
			label="Review range"
			{options}
			value="week"
		/><SegmentedControl label="History range" {options} value="month" />
	</div>
	<div class="sample">
		<h3>Filter chips</h3>
		<div class="examples">
			<FilterChip label="Work" selected /><FilterChip label="Volunteer" /><FilterChip
				label="Personal unavailable"
				disabled
			/><FilterChip label="Work unavailable" selected disabled /><FilterChip
				label="库存管理系统开发"
			/><FilterChip label="Quarterly volunteer coordination and event preparation" selected />
		</div>
	</div>
</section>
