import { readSetting } from '@hourtrail/core';
import { createRepo } from './repo';
import { openDb } from './schema';

/**
 * The app's single database and repository. Screens import these; tests create
 * their own with openDb(name) and createRepo(db, clock, zone).
 */
export const db = openDb();
export const repo = createRepo(db);

export function shouldInitializeReportingZone(
	hasSetting: boolean,
	hasSignedIn: boolean,
	hasPulled: boolean,
): boolean {
	return !hasSetting && (!hasSignedIn || hasPulled);
}

let ensuring: Promise<string> | null = null;

/**
 * Initialize the shared zone only before sign-in or after the first completed pull. Calls are
 * serialized: the app frame and Home both call this, and two concurrent first-run creates of the
 * fixed-id setting would collide.
 */
export function ensureReportingZone(): Promise<string> {
	ensuring ??= ensureReportingZoneOnce().finally(() => {
		ensuring = null;
	});
	return ensuring;
}

async function ensureReportingZoneOnce(): Promise<string> {
	const stored = await db.setting.get('reporting_tz');
	const zone = readSetting('reporting_tz', stored?.value);
	if (zone) return zone;
	const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const [auth, cursor] = await Promise.all([
		db.local.get('auth_device'),
		db.local.get('sync_cursor'),
	]);
	if (!shouldInitializeReportingZone(Boolean(stored), Boolean(auth || cursor), Boolean(cursor)))
		return device;
	await repo.create('setting', { id: 'reporting_tz', value: device });
	return device;
}

/** First-run setup shared by every screen: default types and the reporting zone. */
export async function prepareLocalData(): Promise<void> {
	await repo.ensureSeeded();
	await ensureReportingZone();
}
