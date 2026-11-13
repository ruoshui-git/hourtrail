import { afterEach, describe, expect, it } from 'vitest';
import { clockOffsetMinutes, clockSuspect, observeClock, setClockOffset } from './clock';

afterEach(() => {
	setClockOffset(0);
	observeClock(0, 0, false);
});

describe('device clock', () => {
	it('only cautions when the offset exceeds two minutes and keeps its sign', () => {
		setClockOffset(60_000);
		expect(clockOffsetMinutes()).toBeNull();
		setClockOffset(3 * 60_000);
		expect(clockOffsetMinutes()).toEqual({ minutes: 3, direction: 'behind' });
		setClockOffset(-4 * 60_000);
		expect(clockOffsetMinutes()).toEqual({ minutes: 4, direction: 'ahead' });
	});

	it('detects wall clock jumps against monotonic time during a running session', () => {
		expect(observeClock(10_000, 5_000, true)).toBe(false);
		expect(observeClock(11_000, 6_000, true)).toBe(false);
		expect(observeClock(200_000, 7_000, true)).toBe(true);
		expect(clockSuspect()).toBe(true);
		expect(observeClock(201_000, 8_000, false)).toBe(false);
	});
});
