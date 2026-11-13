import { describe, expect, it } from 'vitest';
import { codeFromHash, formatLastSeen, guessDeviceName, linkUrl, lockoutMessage } from './domain';

describe('cloud helpers', () => {
	it('guesses a device name', () => {
		expect(guessDeviceName('Mozilla iPhone')).toBe('iPhone');
		expect(guessDeviceName('Mozilla')).toBe('This device');
	});
	it('formats last seen relative to the supplied zone', () => {
		const now = Date.parse('2026-11-13T15:00:00Z');
		expect(formatLastSeen(Date.parse('2026-11-13T14:41:00Z'), now, 'America/New_York')).toBe(
			'Today, 9:41 AM',
		);
		expect(formatLastSeen(Date.parse('2026-11-12T23:02:00Z'), now, 'America/New_York')).toBe(
			'Yesterday, 6:02 PM',
		);
	});
	it('rounds lockout time up and encodes links in the fragment', () => {
		expect(lockoutMessage(901)).toBe('Too many attempts. Try again in 16 minutes.');
		expect(linkUrl('https://hourtrail.test', '01234567')).toBe(
			'https://hourtrail.test/link#0123-4567',
		);
		expect(linkUrl('https://hourtrail.test', '0123-4567')).toBe(
			'https://hourtrail.test/link#0123-4567',
		);
		expect(codeFromHash('#0123-4567')).toBe('0123-4567');
		expect(codeFromHash('#bad')).toBeNull();
		expect(codeFromHash('#%GG')).toBeNull();
	});
});
