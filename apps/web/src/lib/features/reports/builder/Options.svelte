<script lang="ts">
	import { monthBounds, type ActivityType, type Day } from '@hourtrail/core';
	import { DateInput, Field, Select, SegmentedControl, Switch, TextInput } from '$lib/components';
	import {
		GROUP_OPTIONS,
		headingFields,
		typeChoices,
		type ReportForm,
	} from '$lib/features/reports/builder/domain';

	let {
		form = $bindable(),
		types,
		today,
		customError,
	}: {
		form: ReportForm;
		types: ActivityType[];
		today: Day;
		customError: string | null;
	} = $props();

	const headings = headingFields();
	const choices = $derived(typeChoices(types));
	const allIds = $derived(choices.map((type) => type.id));

	function isChecked(id: string): boolean {
		return form.typeIds === null || form.typeIds.includes(id);
	}

	// Checking every type returns to "all types", so a later new type is included by default.
	function toggleType(id: string, checked: boolean) {
		const current = form.typeIds ?? allIds;
		const next = checked ? [...current, id] : current.filter((value) => value !== id);
		const unique = [...new Set(next)];
		form.typeIds = allIds.every((value) => unique.includes(value)) ? null : unique;
	}

	// Opening Custom starts from the current month, so the fields are never blank.
	$effect(() => {
		if (form.rangeChoice === 'custom' && form.customFrom === '' && form.customTo === '') {
			const bounds = monthBounds(today);
			form.customFrom = bounds.first;
			form.customTo = bounds.last;
		}
	});
</script>

<div class="options">
	<Field label="Title">
		{#snippet children(props)}<TextInput
				{...props}
				bind:value={form.title}
				autocomplete="off"
			/>{/snippet}
	</Field>

	<div class="group">
		<span class="label">Range</span>
		<SegmentedControl
			label="Range"
			bind:value={form.rangeChoice}
			options={[
				{ value: 'this_month', label: 'This month' },
				{ value: 'last_month', label: 'Last month' },
				{ value: 'this_week', label: 'This week' },
				{ value: 'custom', label: 'Custom' },
			]}
		/>
		{#if form.rangeChoice === 'custom'}
			<div class="custom">
				<Field label="From" error={customError ?? undefined}>
					{#snippet children(props)}<DateInput {...props} bind:value={form.customFrom} />{/snippet}
				</Field>
				<Field label="To">
					{#snippet children(props)}<DateInput {...props} bind:value={form.customTo} />{/snippet}
				</Field>
			</div>
		{/if}
	</div>

	<fieldset class="group">
		<legend class="label">Types</legend>
		{#each choices as type (type.id)}
			<label class="check">
				<input
					type="checkbox"
					checked={isChecked(type.id)}
					onchange={(event) => toggleType(type.id, event.currentTarget.checked)}
				/>
				<span>{type.name}</span>
			</label>
		{/each}
	</fieldset>

	<Field label="Group by">
		{#snippet children(props)}<Select
				{...props}
				bind:value={form.group_by}
				options={GROUP_OPTIONS}
			/>{/snippet}
	</Field>

	<Switch label="Show sessions" bind:checked={form.show_sessions} />
	<Switch label="Show notes" bind:checked={form.show_notes} />

	<div class="group">
		<span class="label">Hours as</span>
		<SegmentedControl
			label="Hours as"
			bind:value={form.hours_format}
			options={[
				{ value: 'hm', label: '2h 14m' },
				{ value: 'decimal', label: '2.23' },
			]}
		/>
	</div>

	<details class="headings">
		<summary>Headings</summary>
		<div class="heading-fields">
			{#each headings as heading (heading.key)}
				<Field label={heading.placeholder}>
					{#snippet children(props)}<TextInput
							{...props}
							bind:value={form.headings[heading.key]}
							placeholder={heading.placeholder}
							autocomplete="off"
						/>{/snippet}
				</Field>
			{/each}
		</div>
	</details>
</div>

<style>
	.options {
		display: grid;
		gap: var(--ht-space-5);
		align-content: start;
		min-width: 0;
	}

	.group {
		display: grid;
		gap: var(--ht-space-2);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.label,
	legend {
		font: var(--ht-type-label);
		padding: 0;
	}

	.custom,
	.heading-fields {
		display: grid;
		gap: var(--ht-space-3);
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		font: var(--ht-type-body);
		color: var(--ht-ink);
	}

	.headings summary {
		min-height: var(--ht-target);
		display: flex;
		align-items: center;
		font: var(--ht-type-body-strong);
		color: var(--ht-ink);
		cursor: pointer;
	}

	.heading-fields {
		padding-top: var(--ht-space-3);
	}
</style>
