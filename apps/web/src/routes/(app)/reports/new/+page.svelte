<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import {
		dayOf,
		readSetting,
		type JsonValue,
		type ReportData,
		type ReportConfig,
	} from '@hourtrail/core';
	import {
		Banner,
		Button,
		ConfirmDialog,
		Field,
		Menu,
		Sheet,
		TextInput,
		showToast,
		type MenuItem,
	} from '$lib/components';
	import { repo } from '$lib/db/app';
	import { live } from '$lib/live.svelte';
	import { downloadCsv, downloadXlsx } from '$lib/features/export';
	import { rangeTitle } from '$lib/features/reports/domain';
	import '$lib/features/reports/print.css';
	import Options from '$lib/features/reports/builder/Options.svelte';
	import Preview from '$lib/features/reports/builder/Preview.svelte';
	import {
		DEFAULT_TITLE,
		defaultForm,
		formConfig,
		formFromConfig,
		previewOf,
		rangeUnit,
		readPreset,
		type ReportForm,
	} from '$lib/features/reports/builder/domain';
	import { readPresets, readReportData, type PresetRow } from '$lib/features/reports/builder/data';

	const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const EMPTY: ReportData = {
		sessions: [],
		work_items: [],
		projects: [],
		types: [],
		places: [],
		settings: {},
	};

	const data = live(async () => ({ loaded: true, data: await readReportData() }), {
		loaded: false,
		data: EMPTY,
	});
	const presets = live(readPresets, [] as PresetRow[]);

	// The clock ticks each minute so "today" moves past midnight while the page stays open.
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	const reportData = $derived(data.current.data);
	const zone = $derived(
		readSetting('reporting_tz', reportData.settings.reporting_tz) ?? deviceZone,
	);
	const weekStart = $derived(readSetting('week_start', reportData.settings.week_start));
	const today = $derived(dayOf(now, zone));

	let form = $state<ReportForm>(defaultForm());
	let loadedId = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let phonePreviewOpen = $state(false);
	let saveOpen = $state(false);
	let renameOpen = $state(false);
	let deleteOpen = $state(false);
	let nameDraft = $state('');
	let nameError = $state<string | undefined>(undefined);

	const built = $derived(data.current.loaded ? formConfig(form, today, weekStart) : null);
	const config = $derived<ReportConfig | null>(
		built !== null && 'config' in built ? built.config : null,
	);
	const problem = $derived(built !== null && 'problem' in built ? built.problem : null);
	const preview = $derived(
		config !== null && data.current.loaded ? previewOf(config, reportData, now) : null,
	);
	const loaded = $derived(
		loadedId === null ? null : (presets.current.find((p) => p.id === loadedId) ?? null),
	);
	const rangeLabel = $derived(
		config === null ? '' : rangeTitle(config.range, rangeUnit(form.rangeChoice)),
	);
	const printedOn = $derived(today);

	function setIncluded(sessionId: string, included: boolean) {
		form.excluded = included
			? form.excluded.filter((value) => value !== sessionId)
			: [...form.excluded, sessionId];
	}

	function applyPreset(row: PresetRow) {
		const parsed = readPreset(row.config);
		if (!parsed.ok) {
			notice = "This preset can't be opened. It was saved by a newer version.";
			return;
		}
		form = formFromConfig(parsed.config);
		loadedId = row.id;
		notice = null;
	}

	function checkName(name: string, exceptId: string | null): string | undefined {
		if (name === '') return 'Enter a name for the preset.';
		if (presets.current.some((p) => p.name === name && p.id !== exceptId)) {
			return 'A preset with this name already exists.';
		}
		return undefined;
	}

	function openSave() {
		nameDraft = form.title.trim() === '' ? DEFAULT_TITLE : form.title.trim();
		nameError = undefined;
		saveOpen = true;
	}

	async function savePreset() {
		const name = nameDraft.trim();
		nameError = checkName(name, null);
		if (nameError !== undefined || config === null) return;
		const stored = JSON.parse(JSON.stringify(config)) as JsonValue;
		const created = await repo.create('report_preset', { name, config: stored });
		loadedId = created.id;
		saveOpen = false;
	}

	function openRename() {
		if (loaded === null) return;
		nameDraft = loaded.name;
		nameError = undefined;
		renameOpen = true;
	}

	async function renamePreset() {
		const name = nameDraft.trim();
		nameError = checkName(name, loadedId);
		if (nameError !== undefined || loadedId === null) return;
		await repo.update('report_preset', loadedId, { name });
		renameOpen = false;
	}

	async function deletePreset() {
		if (loadedId === null) return;
		const id = loadedId;
		const undo = await repo.remove('report_preset', id);
		loadedId = null;
		showToast({
			message: 'Preset deleted.',
			undo: () => {
				void repo.undo(undo);
			},
		});
	}

	const presetItems = $derived<MenuItem[]>([
		...presets.current.map((row) => ({
			label: row.name,
			onselect: () => applyPreset(row),
		})),
		{ label: 'Save as preset…', onselect: openSave },
		{ label: 'Rename preset…', disabled: loaded === null, onselect: openRename },
		{
			label: 'Delete preset…',
			danger: true,
			disabled: loaded === null,
			onselect: () => (deleteOpen = true),
		},
	]);

	async function exportCsv() {
		if (preview === null || config === null) return;
		try {
			await downloadCsv(preview.shown, config);
		} catch {
			showToast({ message: 'Could not save the CSV file.' });
		}
	}

	async function exportXlsx() {
		if (preview === null || config === null) return;
		try {
			await downloadXlsx(preview.shown, config);
		} catch {
			showToast({ message: 'Could not save the Excel file.' });
		}
	}

	const exportItems = $derived<MenuItem[]>([
		{ label: 'Print', onselect: () => window.print() },
		{ label: 'CSV', disabled: config === null, onselect: exportCsv },
		{ label: 'Excel', disabled: config === null, onselect: exportXlsx },
	]);
</script>

<svelte:head><title>Create report · Hourtrail</title></svelte:head>

<section class="builder">
	<header class="builder-top">
		<a class="back" href={resolve('/reports')}><ChevronLeft aria-hidden="true" />Reports</a>
		<h1>Create report</h1>
		<div class="actions">
			<Menu label="Presets" items={presetItems}>
				{#snippet trigger(props)}
					<button type="button" class="action" {...props}>
						Presets{loaded ? `: ${loaded.name}` : ''}
					</button>
				{/snippet}
			</Menu>
			<Menu label="Export" items={exportItems}>
				{#snippet trigger(props)}
					<button type="button" class="action primary" {...props}>Export</button>
				{/snippet}
			</Menu>
		</div>
	</header>

	{#if notice !== null}
		<div class="notice">
			<Banner tone="caution" message={notice} />
		</div>
	{/if}

	<div class="columns">
		<div class="options-column">
			<Options {form} types={reportData.types} {today} customError={problem} />
			<div class="phone-preview-button">
				<Button variant="secondary" onclick={() => (phonePreviewOpen = true)}>Preview</Button>
			</div>
		</div>

		<div class="preview" class:open={phonePreviewOpen}>
			<div class="preview-bar">
				<Button variant="quiet" onclick={() => (phonePreviewOpen = false)}>Options</Button>
			</div>
			{#if problem !== null}
				<p class="problem">{problem}</p>
			{:else if preview !== null && config !== null}
				<Preview
					{config}
					shown={preview.shown}
					groups={preview.groups}
					{rangeLabel}
					{printedOn}
					onToggle={setIncluded}
				/>
			{/if}
		</div>
	</div>
</section>

<Sheet
	bind:open={saveOpen}
	title="Save as preset"
	description="Presets sync with your other devices."
>
	<Field label="Name" error={nameError}>
		{#snippet children(props)}<TextInput
				{...props}
				bind:value={nameDraft}
				autocomplete="off"
			/>{/snippet}
	</Field>
	{#snippet footer()}
		<Button onclick={savePreset}>Save preset</Button>
	{/snippet}
</Sheet>

<Sheet bind:open={renameOpen} title="Rename preset">
	<Field label="Name" error={nameError}>
		{#snippet children(props)}<TextInput
				{...props}
				bind:value={nameDraft}
				autocomplete="off"
			/>{/snippet}
	</Field>
	{#snippet footer()}
		<Button onclick={renamePreset}>Save name</Button>
	{/snippet}
</Sheet>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete this preset?"
	message={loaded ? `“${loaded.name}” is removed from every device.` : ''}
	confirmLabel="Delete preset"
	danger
	onconfirm={deletePreset}
/>

<style>
	.builder {
		display: grid;
		gap: var(--ht-space-5);
	}

	.builder-top {
		display: grid;
		gap: var(--ht-space-3);
	}

	h1 {
		margin: 0;
		font: var(--ht-type-title);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--ht-space-1);
		min-height: var(--ht-target);
		color: var(--ht-ink-2);
		font: var(--ht-type-body);
		text-decoration: none;
		justify-self: start;
	}

	.back :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ht-space-2);
	}

	.action {
		min-height: var(--ht-button-md);
		padding: var(--ht-space-2) var(--ht-space-4);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-control);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
	}

	.action.primary {
		background: var(--ht-ink);
		color: var(--ht-paper);
	}

	.columns {
		display: grid;
		gap: var(--ht-space-6);
		min-width: 0;
	}

	.options-column {
		display: grid;
		gap: var(--ht-space-5);
		min-width: 0;
	}

	.preview {
		min-width: 0;
	}

	.preview-bar {
		display: flex;
		justify-content: flex-start;
		margin-bottom: var(--ht-space-3);
	}

	.problem {
		margin: 0;
		color: var(--ht-danger);
		font: var(--ht-type-body);
	}

	@media (width < 1024px) {
		.preview:not(.open) {
			display: none;
		}

		.preview.open {
			position: fixed;
			inset: 0;
			z-index: var(--ht-z-sheet);
			overflow: auto;
			padding: var(--ht-gutter);
			background: var(--ht-paper);
		}
	}

	@media (width >= 1024px) {
		.phone-preview-button,
		.preview-bar {
			display: none;
		}

		.columns {
			grid-template-columns: calc(var(--ht-target) * 9) minmax(0, 1fr);
			align-items: start;
		}
	}
</style>
