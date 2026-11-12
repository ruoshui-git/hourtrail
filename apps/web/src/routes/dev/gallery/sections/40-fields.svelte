<script lang="ts">
	import { Field, TextInput, TextArea, Select, DateTimeInput } from '$lib/components';
	const note =
		'修复洗手台\nQuarterly volunteer coordination and event preparation\nChecked the fittings at 第1寺院 and recorded the work.';
	const options = [
		{ value: 'work', label: 'Work' },
		{ value: 'volunteer', label: 'Volunteer' },
		{ value: 'personal', label: 'Personal' },
	];
</script>

<section>
	<h2>Fields and inputs</h2>
	<div class="columns">
		<Field label="Work item" hint="Choose a name you will recognise."
			>{#snippet children(props)}<TextInput
					{...props}
					value="库存管理系统开发"
					autocomplete="off"
				/>{/snippet}</Field
		>
		<Field label="Search work items"
			>{#snippet children(props)}<TextInput
					{...props}
					type="search"
					placeholder="Search or name a work item"
				/>{/snippet}</Field
		>
		<Field label="Project"
			>{#snippet children(props)}<TextInput
					{...props}
					value="Inventory Software Development"
				/>{/snippet}</Field
		>
		<Field label="Place"
			>{#snippet children(props)}<TextInput {...props} value="第1寺院" />{/snippet}</Field
		>
		<Field label="Archived work item" hint="Archived items can still appear in reports."
			>{#snippet children(props)}<TextInput
					{...props}
					value="Building Maintenance"
					disabled
				/>{/snippet}</Field
		>
		<Field
			label="Work item name"
			hint="Names can use any language."
			error="Enter a name to save this work item."
			>{#snippet children(props)}<TextInput
					{...props}
					placeholder="Work item name"
				/>{/snippet}</Field
		>
		<Field label="Note" hint="Grows as you write."
			>{#snippet children(props)}<TextArea {...props} value={note} />{/snippet}</Field
		>
		<Field label="Additional note"
			>{#snippet children(props)}<TextArea
					{...props}
					rows={2}
					placeholder="Add a note"
				/>{/snippet}</Field
		>
		<Field label="Archived note"
			>{#snippet children(props)}<TextArea
					{...props}
					value="Building Maintenance"
					disabled
				/>{/snippet}</Field
		>
		<Field label="Session note" error="Shorten this note before saving."
			>{#snippet children(props)}<TextArea {...props} value="修复洗手台" />{/snippet}</Field
		>
		<Field label="Activity type"
			>{#snippet children(props)}<Select {...props} {options} value="volunteer" />{/snippet}</Field
		>
		<Field label="Archived activity type"
			>{#snippet children(props)}<Select
					{...props}
					{options}
					value="work"
					disabled
				/>{/snippet}</Field
		>
		<Field label="Choose an activity type" error="Choose an activity type to continue."
			>{#snippet children(props)}<Select
					{...props}
					options={[{ value: '', label: 'Choose a type' }, ...options]}
				/>{/snippet}</Field
		>
		<Field label="Started" hint="Times follow this device’s time zone."
			>{#snippet children(props)}<DateTimeInput
					{...props}
					value="2026-11-12T04:02"
					min="2026-11-01T00:00"
					max="2026-11-30T23:59"
				/>{/snippet}</Field
		>
		<Field label="Ended"
			>{#snippet children(props)}<DateTimeInput
					{...props}
					value="2026-11-12T07:00"
					disabled
				/>{/snippet}</Field
		>
		<Field label="End time" error="Choose an end time after the start."
			>{#snippet children(props)}<DateTimeInput
					{...props}
					value="2026-11-12T03:00"
				/>{/snippet}</Field
		>
	</div>
</section>
