<script lang="ts">
	type Column = { key: string; label: string; align?: 'start' | 'end'; numeric?: boolean };

	let {
		caption,
		columns,
		rows,
		footer,
		captionVisible = true,
	}: {
		caption: string;
		columns: Column[];
		rows: Record<string, string | number>[];
		footer?: Record<string, string | number>;
		captionVisible?: boolean;
	} = $props();

	const alignOf = (column: Column) => column.align ?? (column.numeric ? 'end' : 'start');
</script>

<div class="scroller">
	<table>
		<caption class:ht-visually-hidden={!captionVisible}>{caption}</caption>
		<thead>
			<tr>
				{#each columns as column (column.key)}<th scope="col" class={alignOf(column)}
						>{column.label}</th
					>{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, index (index)}<tr>
					{#each columns as column (column.key)}<td
							class={alignOf(column)}
							class:numeric={column.numeric}>{row[column.key] ?? ''}</td
						>{/each}
				</tr>{/each}
		</tbody>
		{#if footer}
			<tfoot>
				<tr>
					{#each columns as column (column.key)}<td
							class="total {alignOf(column)}"
							class:numeric={column.numeric}>{footer[column.key] ?? ''}</td
						>{/each}
				</tr>
			</tfoot>
		{/if}
	</table>
</div>

<style>
	.scroller {
		max-width: 100%;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		color: var(--ht-ink);
	}

	caption {
		caption-side: top;
		text-align: start;
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
		padding-bottom: var(--ht-space-2);
	}

	th {
		font: var(--ht-type-label);
		font-weight: var(--ht-weight-strong);
		color: var(--ht-ink-2);
		padding: var(--ht-space-2) var(--ht-space-2);
		border-bottom: var(--ht-hairline) solid var(--ht-line-strong);
		white-space: nowrap;
	}

	td {
		font: var(--ht-type-body);
		padding: var(--ht-space-3) var(--ht-space-2);
		border-bottom: var(--ht-hairline) solid var(--ht-line);
		overflow-wrap: anywhere;
		vertical-align: top;
	}

	th:first-child,
	td:first-child {
		padding-inline-start: 0;
		white-space: nowrap;
	}

	th:last-child,
	td:last-child {
		padding-inline-end: 0;
	}

	.end {
		text-align: end;
	}

	.numeric {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.total {
		font-weight: var(--ht-weight-strong);
		border-bottom: none;
		border-top: var(--ht-hairline) solid var(--ht-line-strong);
	}
</style>
