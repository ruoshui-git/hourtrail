import { describe, expect, it } from 'vitest';
import type { Statistics } from '@hourtrail/core';
import {
	breakdownItems,
	periodTable,
	chartBars,
	chartSeries,
	customProblem,
	parseUnit,
	rangeTitle,
	shiftRange,
} from './domain';

describe('range navigation', () => {
	it('moves days, weeks and months by their own unit', () => {
		expect(shiftRange({ unit: 'day', day: '2026-11-01' }, -1)).toEqual({
			unit: 'day',
			day: '2026-10-31',
		});
		expect(shiftRange({ unit: 'week', day: '2026-11-12' }, 1)).toEqual({
			unit: 'week',
			day: '2026-11-19',
		});
		expect(shiftRange({ unit: 'month', day: '2026-11-12' }, 1)).toEqual({
			unit: 'month',
			day: '2026-12-01',
		});
		expect(shiftRange({ unit: 'month', day: '2026-01-15' }, -1)).toEqual({
			unit: 'month',
			day: '2025-12-01',
		});
	});

	it('moves a custom range by its own length', () => {
		expect(shiftRange({ unit: 'custom', from: '2026-11-10', to: '2026-11-12' }, 1)).toEqual({
			unit: 'custom',
			from: '2026-11-13',
			to: '2026-11-15',
		});
	});
});

describe('custom dates and parsing', () => {
	it('explains unusable custom dates', () => {
		expect(customProblem('2026-11-12', '2026-11-12')).toBeNull();
		expect(customProblem('11/12/2026', '2026-11-12')).toBe('Use dates like 2026-11-12.');
		expect(customProblem('2026-11-13', '2026-11-12')).toBe(
			'The first date must be on or before the last date.',
		);
	});

	it('falls back to Month for unknown units', () => {
		expect(parseUnit('week')).toBe('week');
		expect(parseUnit('bogus')).toBe('month');
	});
});

describe('titles', () => {
	it('formats each span', () => {
		expect(rangeTitle({ from: '2026-11-12', to: '2026-11-12' }, 'day')).toBe('Thu, Nov 12, 2026');
		expect(rangeTitle({ from: '2026-11-09', to: '2026-11-15' }, 'week')).toBe('Nov 9–15, 2026');
		expect(rangeTitle({ from: '2026-11-30', to: '2026-12-06' }, 'week')).toBe(
			'Nov 30 – Dec 6, 2026',
		);
		expect(rangeTitle({ from: '2026-11-01', to: '2026-11-30' }, 'month')).toBe('November 2026');
	});
});

function statsFixture(overrides: Partial<Statistics>): Statistics {
	return {
		range: { from: '2026-11-12', to: '2026-11-12' },
		session_count: 0,
		total_minutes: 0,
		work_minutes: 0,
		by_type: [],
		by_work_item: [],
		by_project: [],
		by_place: [],
		bar_unit: 'day',
		bars: [],
		recent: [],
		...overrides,
	};
}

describe('chart and breakdown inputs', () => {
	it('orders series by type order and drops types without time', () => {
		const stats = statsFixture({
			by_type: [
				{ type_id: 'b', name: 'Overhead', counts_as_work: false, minutes: 60 },
				{ type_id: 'a', name: 'Work', counts_as_work: true, minutes: 90 },
				{ type_id: 'c', name: 'Idle', counts_as_work: false, minutes: 0 },
			],
		});
		const series = chartSeries(
			stats,
			[
				{ id: 'a', color: 'lake', sort_key: 1 },
				{ id: 'b', color: 'rose', sort_key: 2 },
				{ id: 'c', color: 'bark', sort_key: 3 },
			],
			'bark',
		);
		expect(series).toEqual([
			{ key: 'a', label: 'Work', color: 'lake' },
			{ key: 'b', label: 'Overhead', color: 'rose' },
		]);
	});

	it('keys bars by the bar start day and values by type id', () => {
		const bars = chartBars(
			statsFixture({
				bars: [
					{
						from: '2026-11-12',
						to: '2026-11-12',
						minutes: 30,
						work_minutes: 30,
						by_type: [{ type_id: 'a', minutes: 30 }],
					},
				],
			}),
		);
		expect(bars).toEqual([{ id: '2026-11-12', label: 'Nov 12', values: { a: 30 } }]);
	});

	it('colours a breakdown row by the type holding most of its time', () => {
		const work = statsFixture({
			by_project: [{ key: 'p', label: 'Temple', minutes: 100 }],
		});
		const overhead = statsFixture({
			by_project: [{ key: 'p', label: 'Temple', minutes: 40 }],
		});
		const items = breakdownItems(
			statsFixture({ by_project: [{ key: 'p', label: 'Temple', minutes: 140 }] }),
			'by_project',
			[
				{ color: 'lake', stats: work },
				{ color: 'rose', stats: overhead },
			],
			'bark',
		);
		expect(items).toEqual([{ id: 'by_project:p', label: 'Temple', color: 'lake', minutes: 140 }]);
	});
});

describe('period table', () => {
	it('lists only periods with time, then a Total row from core figures', () => {
		const stats = statsFixture({
			total_minutes: 90,
			by_type: [{ type_id: 'a', name: 'Work', counts_as_work: true, minutes: 90 }],
			bars: [
				{
					from: '2026-11-11',
					to: '2026-11-11',
					minutes: 0,
					work_minutes: 0,
					by_type: [],
				},
				{
					from: '2026-11-12',
					to: '2026-11-12',
					minutes: 90,
					work_minutes: 90,
					by_type: [{ type_id: 'a', minutes: 90 }],
				},
			],
		});
		const table = periodTable(stats, [{ key: 'a', label: 'Work', color: 'lake' }], 'hm');
		expect(table.rows).toEqual([{ label: 'Nov 12', series0: '1h 30m', total: '1h 30m' }]);
		expect(table.footer).toEqual({ label: 'Total', series0: '1h 30m', total: '1h 30m' });
	});
});
