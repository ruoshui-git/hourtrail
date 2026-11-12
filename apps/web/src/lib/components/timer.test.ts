import { describe, expect, it } from 'vitest';
import { formatElapsed } from './timer';

describe('formatElapsed', () => {
	it.each([
		[0, '0:00:00'],
		[59000, '0:00:59'],
		[59999, '0:00:59'],
		[3600000, '1:00:00'],
		[8047000, '2:14:07'],
		[36000000, '10:00:00'],
		[360000000, '100:00:00'],
		[-1, '0:00:00'],
	])('formats %i milliseconds as %s', (ms, expected) => {
		expect(formatElapsed(ms)).toBe(expected);
	});
});
