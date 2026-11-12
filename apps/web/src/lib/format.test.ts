import { describe, expect, it } from 'vitest';
import { formatMinutes } from './format';

describe('formatMinutes', () => {
	it('formats hours and minutes', () => {
		expect(formatMinutes(134)).toBe('2h 14m');
		expect(formatMinutes(65)).toBe('1h 05m');
		expect(formatMinutes(9)).toBe('9m');
	});
});
