import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import BarChart from './BarChart.svelte';
import HBarList from './HBarList.svelte';
import StatTile from './StatTile.svelte';
import type { ChartBar, ChartSeries } from './chart';

const series: ChartSeries[] = [
	{ key: 'work', label: 'Work', color: 'lake' },
	{ key: 'overhead', label: 'Overhead', color: 'rose' },
	{ key: 'personal', label: 'Personal', color: 'fern' },
];

const bars: ChartBar[] = [
	{ id: 'mon', label: 'Mon', values: { work: 330, overhead: 45 } },
	{ id: 'tue', label: 'Tue', values: { work: 420, personal: 20 } },
	{ id: 'wed', label: 'Wed', values: {} },
];

// jsdom has no ResizeObserver; bind:clientWidth needs one. Width stays 0 here, so the fallback applies.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

function tableBody(): string[][] {
	const table = screen.getByRole('table', { name: 'Hours by day' });
	return Array.from(table.querySelectorAll('tbody tr')).map((row) =>
		Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent ?? ''),
	);
}

describe('BarChart', () => {
	it('renders a table whose numbers match the bars, with a total per row', () => {
		render(BarChart, { title: 'Hours by day', series, bars });
		expect(tableBody()).toEqual([
			['Mon', '5h 30m', '45m', '0m', '6h 15m'],
			['Tue', '7h 00m', '0m', '20m', '7h 20m'],
			['Wed', '0m', '0m', '0m', '0m'],
		]);
	});

	it('lists every series in the tooltip of a focused column, value first', async () => {
		const { container } = render(BarChart, { title: 'Hours by day', series, bars });
		expect(screen.queryByRole('tooltip')).toBeNull();
		const columns = container.querySelectorAll<SVGGElement>('g.column');
		expect(columns).toHaveLength(3);
		const tue = columns[1]!;
		await fireEvent.focus(tue);
		const tooltip = screen.getByRole('tooltip');
		expect(tooltip.textContent).toContain('Tue');
		const rows = Array.from(tooltip.querySelectorAll('li')).map((li) => li.textContent);
		expect(rows).toEqual(['7h 00m Work', '0m Overhead', '20m Personal', '7h 20m Total']);
		await fireEvent.keyDown(tue, { key: 'Escape' });
		expect(screen.queryByRole('tooltip')).toBeNull();
	});

	it('shows the legend for two or more series and not for one', () => {
		const { unmount } = render(BarChart, { title: 'Hours by day', series, bars });
		expect(screen.getByRole('list', { name: 'Legend' })).toBeTruthy();
		unmount();
		render(BarChart, { title: 'Hours by day', series: series.slice(0, 1), bars });
		expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull();
	});

	it('shows the empty sentence instead of a chart when every value is zero', () => {
		const { container } = render(BarChart, {
			title: 'Hours by day',
			series,
			bars: [{ id: 'x', label: 'Mon', values: { work: 0 } }],
		});
		expect(screen.getByText('Nothing recorded in this range.')).toBeTruthy();
		expect(container.querySelector('svg')).toBeNull();
	});

	it('omits the table when showTable is false', () => {
		render(BarChart, { title: 'Hours by day', series, bars, showTable: false });
		expect(screen.queryByRole('table')).toBeNull();
	});
});

describe('HBarList and StatTile', () => {
	it('keeps Chinese names as text and shows formatted values', () => {
		render(HBarList, {
			title: 'Work items',
			items: [{ id: 'a', label: '库存管理系统开发', color: 'lake', minutes: 312 }],
		});
		expect(screen.getByText('库存管理系统开发')).toBeTruthy();
		expect(screen.getByText('5h 12m')).toBeTruthy();
	});

	it('renders the label under the figure', () => {
		render(StatTile, { label: 'Work hours', value: '38h 20m', secondary: 'This week' });
		expect(screen.getByText('38h 20m')).toBeTruthy();
		expect(screen.getByText('Work hours')).toBeTruthy();
		expect(screen.getByText('This week')).toBeTruthy();
	});
});
