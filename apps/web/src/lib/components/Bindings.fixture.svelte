<script lang="ts">
	import {
		Switch,
		Stepper,
		SegmentedControl,
		FilterChip,
		Field,
		TextInput,
		TextArea,
		Select,
		DateTimeInput,
	} from './index';
	let checked = $state(false);
	let value = $state(5);
	let range = $state('day');
	let selected = $state(false);
	let text = $state('库存管理系统开发');
	let note = $state('修复洗手台');
	let place = $state('temple');
	let start = $state('2026-11-12T04:02');
</script>

<Switch label="Capture place" bind:checked />
<output aria-label="Switch value">{String(checked)}</output>
<Switch label="Disabled switch" disabled />
<Stepper label="Interval" min={5} max={15} step={5} bind:value />
<output aria-label="Stepper value">{value}</output>
<Stepper label="Disabled interval" value={5} disabled />
<SegmentedControl
	label="Range"
	bind:value={range}
	options={[
		{ value: 'day', label: 'Day' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
	]}
/>
<output aria-label="Range value">{range}</output>
<FilterChip label="Work" bind:selected />
<output aria-label="Chip value">{String(selected)}</output>
<FilterChip label="Disabled chip" disabled />
<Field label="Work item" hint="Use any language" error="Enter a name" id="work-item"
	>{#snippet children(props)}<TextInput {...props} bind:value={text} />{/snippet}</Field
>
<output aria-label="Text value">{text}</output>
<Field label="Note"
	>{#snippet children(props)}<TextArea {...props} bind:value={note} />{/snippet}</Field
>
<output aria-label="Note value">{note}</output>
<Field label="Place"
	>{#snippet children(props)}<Select
			{...props}
			bind:value={place}
			options={[
				{ value: 'temple', label: '第1寺院' },
				{ value: 'office', label: 'Office' },
			]}
		/>{/snippet}</Field
>
<output aria-label="Place value">{place}</output>
<Field label="Started"
	>{#snippet children(props)}<DateTimeInput {...props} bind:value={start} />{/snippet}</Field
>
<output aria-label="Started value">{start}</output>
