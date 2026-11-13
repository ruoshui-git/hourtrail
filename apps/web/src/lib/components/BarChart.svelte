<script lang="ts">
	import {
		barTotal,
		estimateTextWidth,
		formatMinutes,
		niceTicks,
		stackSegments,
		toMinutes,
		type ChartBar,
		type ChartSeries,
	} from './chart';
	import ChartLegend from './ChartLegend.svelte';
	import ChartTooltip from './ChartTooltip.svelte';
	import DataTable from './DataTable.svelte';

	let {
		title,
		series,
		bars,
		showTable = true,
		height = 'regular',
		format = 'hm',
	}: {
		title: string;
		series: ChartSeries[];
		bars: ChartBar[];
		showTable?: boolean;
		height?: 'regular' | 'compact';
		format?: 'hm' | 'decimal';
	} = $props();

	// The viewBox is the measured container width, so one unit is one CSS px and the column cap
	// holds at every width. The constants below mirror tokens (--ht-stack-gap, --ht-radius-blaze);
	// SVG geometry cannot read them, so they are kept here with the same values.
	const PLOT_HEIGHT = { regular: 200, compact: 120 };
	const AXIS_WIDTH = 36;
	const RIGHT_PAD = 4;
	const TOP = 28;
	const BOTTOM = 24;
	const MAX_COLUMN = 24;
	const STACK_GAP = 2;
	const RADIUS = 2;
	const FALLBACK_WIDTH = 320;
	const LABEL_GAP = 8;

	const uid = $props.id();
	let measured = $state(0);
	let hovered = $state<number | null>(null);
	let focused = $state<number | null>(null);

	const width = $derived(measured > 0 ? measured : FALLBACK_WIDTH);
	const plotHeight = $derived(PLOT_HEIGHT[height]);
	const totalHeight = $derived(TOP + plotHeight + BOTTOM);
	const plotWidth = $derived(Math.max(1, width - AXIS_WIDTH - RIGHT_PAD));
	const slot = $derived(plotWidth / Math.max(1, bars.length));
	const columnWidth = $derived(Math.min(MAX_COLUMN, slot * 0.6));

	const colorOf = $derived(new Map(series.map((item) => [item.key, item.color])));

	// Values are reordered to the series order so stacking follows the series, not the bar's keys.
	const columns = $derived(
		bars.map((bar) => {
			const ordered: ChartBar = {
				...bar,
				values: Object.fromEntries(
					series.map((item) => [item.key, toMinutes(bar.values[item.key])]),
				),
			};
			return { bar, ordered, segments: stackSegments(ordered), total: barTotal(ordered) };
		}),
	);

	const maxTotal = $derived(Math.max(0, ...columns.map((column) => column.total)));
	const isEmpty = $derived(maxTotal <= 0);
	// Axis in hours; the value scale is kept in minutes.
	const ticks = $derived(niceTicks(maxTotal / 60));
	const axisMax = $derived((ticks[ticks.length - 1] || 1) * 60);

	const yOf = (minutes: number) => TOP + plotHeight - (minutes / axisMax) * plotHeight;
	const xCenter = (index: number) => AXIS_WIDTH + slot * (index + 0.5);
	// Leave LABEL_GAP between neighbouring totals; the width estimate is approximate.
	const fits = (text: string) => estimateTextWidth(text) + LABEL_GAP <= slot;

	// Show every nth x caption so that neighbours never touch; captions are never rotated.
	const labelStep = $derived.by(() => {
		const widest = Math.max(0, ...bars.map((bar) => estimateTextWidth(bar.label)));
		return Math.max(1, Math.ceil((widest + LABEL_GAP) / slot));
	});

	function segmentPath(
		x: number,
		segment: { y0: number; y1: number },
		index: number,
		count: number,
	): string {
		const top = yOf(segment.y1) + (index < count - 1 ? STACK_GAP / 2 : 0);
		const bottom = yOf(segment.y0) - (index > 0 ? STACK_GAP / 2 : 0);
		const height = bottom - top;
		if (height <= 0) return '';
		const left = x - columnWidth / 2;
		const right = x + columnWidth / 2;
		// Only the top segment of a column has rounded corners.
		const radius = index === count - 1 ? Math.min(RADIUS, columnWidth / 2, height) : 0;
		if (radius === 0) return `M${left} ${top}H${right}V${bottom}H${left}Z`;
		return `M${left} ${bottom}V${top + radius}A${radius} ${radius} 0 0 1 ${left + radius} ${top}H${right - radius}A${radius} ${radius} 0 0 1 ${right} ${top + radius}V${bottom}Z`;
	}

	const shown = $derived(focused ?? hovered);

	const tip = $derived.by(() => {
		if (shown === null || isEmpty) return null;
		const column = columns[shown];
		if (!column) return null;
		const x = xCenter(shown);
		const ratio = x / width;
		return {
			title: column.bar.label,
			left: ratio * 100,
			align:
				ratio < 0.3 ? ('start' as const) : ratio > 0.7 ? ('end' as const) : ('center' as const),
			rows: [
				...series.map((item) => ({
					key: item.key,
					label: item.label,
					value: formatMinutes(column.ordered.values[item.key] ?? 0, format),
					color: item.color,
				})),
				{ key: 'total', label: 'Total', value: formatMinutes(column.total, format) },
			],
		};
	});

	const tableColumns = $derived([
		{ key: 'label', label: 'Period' },
		...series.map((item, index) => ({
			key: `series${index}`,
			label: item.label,
			align: 'end' as const,
			numeric: true,
		})),
		{ key: 'total', label: 'Total', align: 'end' as const, numeric: true },
	]);

	const tableRows = $derived(
		columns.map((column) => ({
			label: column.bar.label,
			...Object.fromEntries(
				series.map((item, index) => [
					`series${index}`,
					formatMinutes(column.ordered.values[item.key] ?? 0, format),
				]),
			),
			total: formatMinutes(column.total, format),
		})),
	);

	function columnLabel(column: (typeof columns)[number]): string {
		const parts = series.map(
			(item) => `${item.label} ${formatMinutes(column.ordered.values[item.key] ?? 0, format)}`,
		);
		return `${column.bar.label}: ${parts.join(', ')}. Total ${formatMinutes(column.total, format)}.`;
	}
</script>

<div class="bar-chart">
	{#if isEmpty}
		<p class="empty">Nothing recorded in this range.</p>
	{:else}
		{#if series.length >= 2}<ChartLegend {series} />{/if}
		<div class="chart" bind:clientWidth={measured}>
			<svg class="svg" viewBox="0 0 {width} {totalHeight}" role="group" aria-label={title}>
				<text class="axis-caption" x="0" y="12">Hours (h)</text>
				{#each ticks as tick (tick)}
					<line
						class:baseline={tick === 0}
						class="grid"
						x1={AXIS_WIDTH}
						x2={width - RIGHT_PAD}
						y1={yOf(tick * 60)}
						y2={yOf(tick * 60)}
					/>
					<text class="tick" x={AXIS_WIDTH - 6} y={yOf(tick * 60)} dominant-baseline="middle"
						>{tick}</text
					>
				{/each}
				{#each columns as column, index (column.bar.id)}
					{@const x = xCenter(index)}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<g
						class="column"
						tabindex="0"
						role="img"
						aria-label={columnLabel(column)}
						onfocus={() => (focused = index)}
						onblur={() => {
							if (focused === index) focused = null;
						}}
						onpointerenter={() => (hovered = index)}
						onpointerleave={() => {
							if (hovered === index) hovered = null;
						}}
						onkeydown={(event) => {
							if (event.key === 'Escape') {
								focused = null;
								hovered = null;
							}
						}}
					>
						<rect class="hit" x={x - slot / 2} y={TOP} width={slot} height={plotHeight} />
						{#each column.segments as segment, position (segment.key)}
							<path
								class="segment"
								style:--blaze={`var(--ht-blaze-${colorOf.get(segment.key)})`}
								d={segmentPath(x, segment, position, column.segments.length)}
							/>
						{/each}
						{#if column.total > 0 && fits(formatMinutes(column.total, format))}
							<text class="total" {x} y={yOf(column.total) - 6} text-anchor="middle"
								>{formatMinutes(column.total, format)}</text
							>
						{:else if column.total === 0 && fits('0m')}
							<text class="total" {x} y={yOf(0) - 6} text-anchor="middle">0m</text>
						{/if}
					</g>
				{/each}
				{#each columns as column, index (column.bar.id)}
					{#if index % labelStep === 0}
						<text class="x-label" x={xCenter(index)} y={totalHeight - 6} text-anchor="middle"
							>{column.bar.label}</text
						>
					{/if}
				{/each}
			</svg>
			{#if tip}
				<ChartTooltip
					id={`${uid}-tip`}
					title={tip.title}
					rows={tip.rows}
					left={tip.left}
					align={tip.align}
				/>
			{/if}
		</div>
		{#if showTable}
			<DataTable caption={title} captionVisible={false} columns={tableColumns} rows={tableRows} />
		{/if}
	{/if}
</div>

<style>
	.bar-chart {
		display: grid;
		gap: var(--ht-space-4);
		min-width: 0;
	}

	.empty {
		font: var(--ht-type-body);
		color: var(--ht-ink-2);
	}

	.chart {
		position: relative;
		min-width: 0;
	}

	.svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	text {
		font: var(--ht-type-caption);
		font-variant-numeric: tabular-nums;
	}

	.axis-caption,
	.tick,
	.x-label {
		fill: var(--ht-ink-2);
	}

	.total {
		fill: var(--ht-ink);
	}

	.grid,
	.baseline {
		stroke-width: var(--ht-hairline);
	}

	.grid {
		stroke: var(--ht-line);
	}

	.baseline {
		stroke: var(--ht-line-strong);
	}

	.hit {
		fill: transparent;
	}

	.column {
		outline: none;
	}

	.column:focus-visible .hit {
		stroke: var(--ht-ink);
		stroke-width: var(--ht-focus-width);
	}

	.segment {
		fill: var(--blaze);
		transition: opacity var(--ht-duration-press) var(--ht-ease);
	}

	@media (hover: hover) {
		.column:hover .segment {
			opacity: 0.8;
		}
	}

	.column:focus-visible .segment {
		opacity: 0.8;
	}
</style>
