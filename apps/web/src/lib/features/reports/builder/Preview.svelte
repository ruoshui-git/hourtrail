<script lang="ts">
	import {
		formatHours,
		headingLabel,
		sessionCells,
		type Report,
		type ReportConfig,
	} from '@hourtrail/core';
	import type { PreviewGroup } from '$lib/features/reports/builder/domain';

	/** The same markup prints: app chrome and excluded rows are hidden by print.css. */
	let {
		config,
		shown,
		groups,
		rangeLabel,
		printedOn,
		onToggle,
	}: {
		config: ReportConfig;
		shown: Report;
		groups: PreviewGroup[];
		rangeLabel: string;
		printedOn: string;
		onToggle: (sessionId: string, included: boolean) => void;
	} = $props();

	const format = $derived(config.hours_format);
	const hours = (minutes: number) => formatHours(minutes, format);
	const picks = $derived(config.show_sessions);
</script>

<article class="print-sheet" aria-label="Report preview">
	<header class="sheet-head">
		<h2>{config.title}</h2>
		<p class="range">{rangeLabel}</p>
	</header>

	<section class="totals" aria-label="Totals">
		<p class="line work" data-kind="work">
			<span>{headingLabel('work_hours', config)}</span>
			<span class="value">{hours(shown.work_minutes)}</span>
		</p>
		{#if shown.other_minutes.length > 0}
			<p class="caption">{headingLabel('other_hours', config)}</p>
			{#each shown.other_minutes as other (other.type_id)}
				<p class="line other">
					<span>{other.name}</span>
					<span class="value">{hours(other.minutes)}</span>
				</p>
			{/each}
		{/if}
		<p class="line total">
			<span>{headingLabel('total', config)}</span>
			<span class="value">{hours(shown.total_minutes)}</span>
		</p>
	</section>

	{#if shown.rows.length === 0}
		<p class="empty">No time recorded in this range.</p>
	{/if}

	{#each groups as group (group.key)}
		<section class="group" data-group={group.key}>
			<h3>
				<span>{group.label}</span>
				<span class="value">{hours(group.minutes)}</span>
			</h3>
			{#if group.rows !== null}
				<table>
					<thead>
						<tr>
							{#if picks}<th class="pick"><span class="sr-only">Included</span></th>{/if}
							<th>{headingLabel('date', config)}</th>
							<th>{headingLabel('start', config)}</th>
							<th>{headingLabel('end', config)}</th>
							<th class="num">{headingLabel('hours', config)}</th>
							<th>{headingLabel('work_item', config)}</th>
						</tr>
					</thead>
					{#each group.rows as row (`${row.session_id}-${row.start_at}`)}
						{@const cells = sessionCells(row)}
						<tbody class="session" class:excluded={row.excluded}>
							<tr class:excluded={row.excluded}>
								{#if picks}
									<td class="pick">
										<input
											type="checkbox"
											checked={!row.excluded}
											aria-label={`Include ${cells.work_item || 'session'} on ${cells.date} ${cells.start}`}
											onchange={(event) => onToggle(row.session_id, event.currentTarget.checked)}
										/>
									</td>
								{/if}
								<td>{cells.date}</td>
								<td>{cells.start}</td>
								<td>{cells.end}</td>
								<td class="num">{hours(cells.minutes)}</td>
								<td>
									{cells.work_item}
									{#if row.excluded}<span class="mark">Excluded</span>{/if}
								</td>
							</tr>
							{#if row.note}
								<tr class="note-row" class:excluded={row.excluded}>
									<td colspan={picks ? 6 : 5}>
										<span class="note-label">{headingLabel('note', config)}:</span>
										{row.note}
									</td>
								</tr>
							{/if}
						</tbody>
					{/each}
				</table>
			{/if}
		</section>
	{/each}

	<footer class="sheet-foot">Hourtrail · printed {printedOn}</footer>
</article>

<style>
	.print-sheet {
		display: grid;
		gap: var(--ht-space-5);
		padding: var(--ht-space-5);
		border: var(--ht-hairline) solid var(--ht-line);
		border-radius: var(--ht-radius-panel);
		background: var(--ht-surface);
		color: var(--ht-ink);
		font: var(--ht-type-body);
		min-width: 0;
	}

	h2,
	h3 {
		margin: 0;
		font: var(--ht-type-heading);
	}

	.sheet-head {
		display: grid;
		gap: var(--ht-space-1);
	}

	.range,
	.caption,
	.note-label,
	.sheet-foot {
		margin: 0;
		color: var(--ht-ink-2);
		font: var(--ht-type-caption);
	}

	.totals {
		display: grid;
		gap: var(--ht-space-1);
		padding-bottom: var(--ht-space-3);
		border-bottom: var(--ht-hairline) solid var(--ht-line);
	}

	.line {
		display: flex;
		justify-content: space-between;
		gap: var(--ht-space-4);
		margin: 0;
	}

	.line.work,
	.line.total {
		font: var(--ht-type-body-strong);
	}

	.value {
		font-variant-numeric: tabular-nums;
	}

	.group {
		display: grid;
		gap: var(--ht-space-2);
		min-width: 0;
	}

	h3 {
		display: flex;
		justify-content: space-between;
		gap: var(--ht-space-4);
		font: var(--ht-type-body-strong);
	}

	.empty {
		margin: 0;
		color: var(--ht-ink-2);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: auto;
		font: var(--ht-type-caption);
	}

	th,
	td {
		padding: var(--ht-space-1) var(--ht-space-2);
		border-bottom: var(--ht-hairline) solid var(--ht-line);
		text-align: start;
		vertical-align: top;
	}

	th {
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
	}

	.num {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	.note-row td {
		padding-top: 0;
		border-bottom: var(--ht-hairline) solid var(--ht-line);
		color: var(--ht-ink-2);
		overflow-wrap: anywhere;
	}

	.excluded td {
		color: var(--ht-ink-3);
		text-decoration: line-through;
	}

	.mark {
		display: inline-block;
		margin-inline-start: var(--ht-space-2);
		padding: 0 var(--ht-space-1);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-chip);
		color: var(--ht-ink-2);
		text-decoration: none;
	}

	.pick {
		width: var(--ht-target);
	}

	.pick input {
		width: var(--ht-icon);
		height: var(--ht-icon);
		margin: 0;
	}

	.sr-only {
		position: absolute;
		width: var(--ht-hairline);
		height: var(--ht-hairline);
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
