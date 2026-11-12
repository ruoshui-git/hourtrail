import { readSetting } from '@hourtrail/core';
import { createRepo } from './repo';
import { openDb } from './schema';

/**
 * The app's single database and repository. Screens import these; tests create
 * their own with openDb(name) and createRepo(db, clock, zone).
 */
export const db = openDb();
export const repo = createRepo(db);

/**
 * The synced reporting time zone, set from this device the first time. Call it
 * outside live queries (they are read-only): the app frame does on start.
 */
export async function ensureReportingZone(): Promise<string> {
	const stored = await db.setting.get('reporting_tz');
	const zone = readSetting('reporting_tz', stored?.value);
	if (zone) return zone;
	const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
	await repo.create('setting', { id: 'reporting_tz', value: device });
	return device;
}

/** First-run setup shared by every screen: default types and the reporting zone. */
export async function prepareLocalData(): Promise<void> {
	await repo.ensureSeeded();
	await ensureReportingZone();
}
