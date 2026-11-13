import { describe, expect, it } from 'vitest';
import { reportConfigSchema } from './config';
import { resolveRange } from './relative';

const STORED = { from: '2020-01-01', to: '2020-01-02' };
const config = (relative_range: 'this_month' | 'last_month' | 'this_week' | null) => ({
	range: STORED,
	relative_range,
});

describe('resolveRange', () => {
	it('returns the stored range when there is no relative range', () => {
		expect(resolveRange(config(null), '2026-11-12', 1)).toEqual(STORED);
	});

	it('ignores the stored range once a relative range is set', () => {
		expect(resolveRange(config('this_month'), '2026-11-12', 1)).toEqual({
			from: '2026-11-01',
			to: '2026-11-30',
		});
	});

	it('covers the whole current month, including leap February', () => {
		expect(resolveRange(config('this_month'), '2028-02-10', 1)).toEqual({
			from: '2028-02-01',
			to: '2028-02-29',
		});
		expect(resolveRange(config('this_month'), '2026-02-01', 1)).toEqual({
			from: '2026-02-01',
			to: '2026-02-28',
		});
		expect(resolveRange(config('this_month'), '2026-11-30', 1)).toEqual({
			from: '2026-11-01',
			to: '2026-11-30',
		});
	});

	it('moves last month back across the year edge and into a leap February', () => {
		expect(resolveRange(config('last_month'), '2027-01-05', 1)).toEqual({
			from: '2026-12-01',
			to: '2026-12-31',
		});
		expect(resolveRange(config('last_month'), '2026-01-31', 1)).toEqual({
			from: '2025-12-01',
			to: '2025-12-31',
		});
		expect(resolveRange(config('last_month'), '2028-03-01', 1)).toEqual({
			from: '2028-02-01',
			to: '2028-02-29',
		});
	});

	it('starts the week on Monday when week_start is 1', () => {
		// 2026-11-12 is a Thursday; the Monday-start week is Nov 9 to Nov 15.
		expect(resolveRange(config('this_week'), '2026-11-12', 1)).toEqual({
			from: '2026-11-09',
			to: '2026-11-15',
		});
		// Monday itself opens its own week; Sunday closes the week that began the Monday before.
		expect(resolveRange(config('this_week'), '2026-11-09', 1)).toEqual({
			from: '2026-11-09',
			to: '2026-11-15',
		});
		expect(resolveRange(config('this_week'), '2026-11-15', 1)).toEqual({
			from: '2026-11-09',
			to: '2026-11-15',
		});
	});

	it('starts the week on Sunday when week_start is 7', () => {
		expect(resolveRange(config('this_week'), '2026-11-15', 7)).toEqual({
			from: '2026-11-15',
			to: '2026-11-21',
		});
		expect(resolveRange(config('this_week'), '2026-11-09', 7)).toEqual({
			from: '2026-11-08',
			to: '2026-11-14',
		});
	});

	it('crosses December into January for a week', () => {
		// 2026-12-31 is a Thursday.
		expect(resolveRange(config('this_week'), '2026-12-31', 1)).toEqual({
			from: '2026-12-28',
			to: '2027-01-03',
		});
	});
});

describe('reportConfigSchema relative_range', () => {
	const base = { range: STORED, title: 'Work report' };

	it('parses an old config without the field and defaults it to null', () => {
		expect(reportConfigSchema.parse(base).relative_range).toBeNull();
	});

	it('accepts each relative range and rejects anything else', () => {
		for (const value of ['this_month', 'last_month', 'this_week'] as const) {
			expect(reportConfigSchema.parse({ ...base, relative_range: value }).relative_range).toBe(
				value,
			);
		}
		expect(() => reportConfigSchema.parse({ ...base, relative_range: 'next_month' })).toThrow();
		expect(() => reportConfigSchema.parse({ ...base, relative_range: 'custom' })).toThrow();
	});

	it('still rejects unknown keys', () => {
		expect(() => reportConfigSchema.parse({ ...base, relative: 'this_month' })).toThrow();
	});
});
