import { describe, expect, it } from 'vitest';
import { isInDay, percentOfDay, ribbonSpan } from './trail';

const HOUR = 3_600_000;

describe('ribbon positioning', () => {
	it('places a segment in a normal 24-hour day', () => {
		const start = 0;
		const span = ribbonSpan(6 * HOUR, 12 * HOUR, 0, start, 24 * HOUR);
		expect(span?.left).toBeCloseTo(25);
		expect(span?.width).toBeCloseTo(25);
	});

	it('scales hours in a 23-hour day to the real length of the day', () => {
		const dayEnd = 23 * HOUR;
		expect(percentOfDay(HOUR, 0, dayEnd)).toBeCloseTo(100 / 23);
		const span = ribbonSpan(0, HOUR, 0, 0, dayEnd);
		expect(span?.width).toBeCloseTo(100 / 23);
	});

	it('scales hours in a 25-hour day to the real length of the day', () => {
		const dayEnd = 25 * HOUR;
		expect(percentOfDay(13 * HOUR, 0, dayEnd)).toBeCloseTo(52);
		const span = ribbonSpan(12 * HOUR, 13 * HOUR, 0, 0, dayEnd);
		expect(span?.left).toBeCloseTo(48);
		expect(span?.width).toBeCloseTo(4);
	});

	it('ends a running segment at now', () => {
		const span = ribbonSpan(12 * HOUR, null, 18 * HOUR, 0, 24 * HOUR);
		expect(span?.left).toBeCloseTo(50);
		expect(span?.width).toBeCloseTo(25);
	});

	it('clips segments that cross midnight to the day', () => {
		const span = ribbonSpan(-2 * HOUR, 2 * HOUR, 0, 0, 24 * HOUR);
		expect(span?.left).toBeCloseTo(0);
		expect(span?.width).toBeCloseTo((2 / 24) * 100);
	});

	it('returns null for a segment outside the day', () => {
		expect(ribbonSpan(25 * HOUR, 26 * HOUR, 0, 0, 24 * HOUR)).toBeNull();
		expect(ribbonSpan(-3 * HOUR, -1 * HOUR, 0, 0, 24 * HOUR)).toBeNull();
	});

	it('shows the now tick only inside [dayStart, dayEnd)', () => {
		expect(isInDay(0, 0, 24 * HOUR)).toBe(true);
		expect(isInDay(24 * HOUR - 1, 0, 24 * HOUR)).toBe(true);
		expect(isInDay(24 * HOUR, 0, 24 * HOUR)).toBe(false);
		expect(isInDay(-1, 0, 24 * HOUR)).toBe(false);
	});
});
