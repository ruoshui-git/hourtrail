import { buildBackup, ENTITIES, readSetting } from '@hourtrail/core';
import type { BackupFile } from '@hourtrail/core';
import type { HourtrailDB } from '$lib/db/schema';

/** All exported stores, identity and zone belong to one consistent read snapshot. */
export async function readBackup(
	db: HourtrailDB,
	exportedAt: number,
): Promise<{ backup: BackupFile; tz: string }> {
	return db.transaction('r', [...ENTITIES, 'local_fix', 'local'], async () => {
		const records = Object.fromEntries(
			await Promise.all(
				ENTITIES.map(async (entity) => [entity, await db.entity(entity).toArray()]),
			),
		) as BackupFile['records'];
		const localFixes = await db.local_fix.toArray();
		const id = (await db.local.get('device_id'))?.value;
		const name = (await db.local.get('device_name'))?.value;
		const tz = readSetting(
			'reporting_tz',
			records.setting.find((record) => record.id === 'reporting_tz' && record.deleted_at === null)
				?.value,
		);
		if (typeof id !== 'string' || !tz) throw new Error('Device setup is incomplete.');
		return {
			backup: buildBackup({
				records,
				localFixes,
				exportedAt,
				device: { id, name: typeof name === 'string' ? name : null },
			}),
			tz,
		};
	});
}

/** A dismissed share sheet is the only non-error result that did not save a file. */
export async function deliverBackup(file: File): Promise<boolean> {
	const appleMobile =
		/iPhone|iPad|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	if (appleMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file] });
			return true;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return false;
			throw error;
		}
	}
	const url = URL.createObjectURL(file);
	const anchor = document.createElement('a');
	try {
		anchor.href = url;
		anchor.download = file.name;
		document.body.append(anchor);
		anchor.click();
	} finally {
		anchor.remove();
		// Allow the browser to consume the URL before releasing it, including on iOS.
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}
	return true;
}
