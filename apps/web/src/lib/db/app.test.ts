import { describe, expect, it } from 'vitest';
import { shouldInitializeReportingZone } from './app';

describe('reporting zone bootstrap', () => {
	it('initializes on a device that has never signed in', () => {
		expect(shouldInitializeReportingZone(false, false, false)).toBe(true);
	});

	it('waits for the first pull on a signed-in device', () => {
		expect(shouldInitializeReportingZone(false, true, false)).toBe(false);
		expect(shouldInitializeReportingZone(false, true, true)).toBe(true);
	});

	it('preserves a remote reporting zone after the first pull', () => {
		expect(shouldInitializeReportingZone(true, true, true)).toBe(false);
	});
});
