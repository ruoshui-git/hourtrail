import { describe, expect, it } from 'vitest';
import { estimateTextWidth, formatMinutes, niceTicks, stackSegments } from './chart';

describe('niceTicks', () => {
	it.each([
		[0, [0]],
		[-3, [0]],
		[0.75, [0, 0.2, 0.4, 0.6, 0.8]],
		[3, [0, 1, 2, 3]],
		[7, [0, 2, 4, 6, 8]],
		[8, [0, 2, 4, 6, 8]],
		[40, [0, 10, 20, 30, 40]],
		[1234, [0, 500, 1000, 1500]],
	])('ticks for maximum %s start at zero and reach it', (max, expected) => {
		expect(niceTicks(max)).toEqual(expected);
	});

	it('uses the target count to choose the step', () => {
		expect(niceTicks(10, 2)).toEqual([0, 5, 10]);
	});

	it('never rounds below the maximum', () => {
		for (const max of [0.3, 1.1, 9.9, 17, 333]) {
			const ticks = niceTicks(max);
			expect(ticks[0]).toBe(0);
			expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
		}
	});
});

describe('formatMinutes', () => {
	it.each([
		[0, '0m'],
		[45, '45m'],
		[60, '1h 00m'],
		[312, '5h 12m'],
		[245, '4h 05m'],
		[2294, '38h 14m'],
		[59.6, '1h 00m'],
		[-5, '0m'],
		[Number.NaN, '0m'],
	])('formats %s minutes as %s', (minutes, expected) => {
		expect(formatMinutes(minutes)).toBe(expected);
	});
});

describe('stackSegments', () => {
	it('keeps the bar key order bottom to top and skips zero values', () => {
		const segments = stackSegments({
			id: 'mon',
			label: 'Mon',
			values: { work: 300, overhead: 0, volunteer: 45, personal: -4 },
		});
		expect(segments).toEqual([
			{ key: 'work', y0: 0, y1: 300 },
			{ key: 'volunteer', y0: 300, y1: 345 },
		]);
	});

	it('is contiguous: each segment starts where the previous one ends', () => {
		const segments = stackSegments({
			id: 'tue',
			label: 'Tue',
			values: { a: 10, b: 25, c: 5 },
		});
		expect(segments.map((s) => s.y0)).toEqual([0, 10, 35]);
		expect(segments.map((s) => s.y1)).toEqual([10, 35, 40]);
	});

	it('returns nothing for an empty column', () => {
		expect(stackSegments({ id: 'wed', label: 'Wed', values: {} })).toEqual([]);
	});
});

describe('estimateTextWidth', () => {
	it('counts CJK glyphs wider than Latin ones', () => {
		expect(estimateTextWidth('修复')).toBeGreaterThan(estimateTextWidth('ab'));
		expect(estimateTextWidth('a b')).toBe(9 + 4 + 9);
	});
});
