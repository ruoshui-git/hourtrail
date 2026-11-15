import { describe, expect, it } from 'vitest';
import { formatZoneOffset, searchZones } from './domain';

describe('settings time zone helpers', () => {
	it('searches case-insensitively and treats separators loosely', () => {
		expect(searchZones(['America/New_York', 'Asia/Tokyo'], 'new york')).toEqual([
			'America/New_York',
		]);
		expect(searchZones(['America/New_York', 'Asia/Tokyo'], 'TOKYO')).toEqual(['Asia/Tokyo']);
	});

	it('formats offsets at the supplied instant', () => {
		const winter = Date.parse('2026-01-15T12:00:00Z');
		expect(formatZoneOffset('Asia/Tokyo', winter)).toBe('UTC+09:00');
		expect(formatZoneOffset('America/New_York', winter)).toBe('UTC-05:00');
		expect(formatZoneOffset('UTC', winter)).toBe('UTC+00:00');
	});
});
