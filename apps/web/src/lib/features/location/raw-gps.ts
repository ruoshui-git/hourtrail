import type { HourtrailDB, LocalFix } from '$lib/db/schema';
import type { Repo } from '$lib/db/repo';

export type RawFixInput = Pick<
	LocalFix,
	'session_id' | 'kind' | 'lat' | 'lng' | 'accuracy_m' | 'captured_at'
>;

// A session_fix id can already exist as a scrubbed tombstone (raw sync was turned off and the
// coordinates deleted from the cloud). A put cannot change deletion state (SPEC rule 5), so
// revive it with undelete and then update its fields instead of creating it again.
async function upsertSessionFix(
	db: HourtrailDB,
	repo: Repo,
	id: string,
	fields: Omit<LocalFix, 'id'>,
): Promise<void> {
	const existing = await db.session_fix.get(id);
	if (!existing) {
		await repo.create('session_fix', { id, ...fields });
		return;
	}
	if (existing.deleted_at !== null) await repo.restore('session_fix', id);
	await repo.update('session_fix', id, fields);
}

export async function saveCapturedFix(
	db: HourtrailDB,
	repo: Repo,
	fix: RawFixInput,
	sync: boolean,
): Promise<void> {
	const id = `${fix.session_id}:${fix.kind}`;
	if (sync) await upsertSessionFix(db, repo, id, fix);
	else await db.local_fix.put({ id, ...fix });
}

export async function enableRawCoordinateSync(db: HourtrailDB, repo: Repo): Promise<void> {
	const fixes = await db.local_fix.toArray();
	for (const fix of fixes) {
		await upsertSessionFix(db, repo, fix.id, {
			session_id: fix.session_id,
			kind: fix.kind,
			lat: fix.lat,
			lng: fix.lng,
			accuracy_m: fix.accuracy_m,
			captured_at: fix.captured_at,
		});
		await db.local_fix.delete(fix.id);
	}
}

export async function deleteCloudRawCoordinates(db: HourtrailDB, repo: Repo): Promise<void> {
	const fixes = (await db.session_fix.toArray()).filter((fix) => fix.deleted_at === null);
	for (const fix of fixes) {
		await db.local_fix.put({
			id: fix.id,
			session_id: fix.session_id,
			kind: fix.kind,
			lat: fix.lat,
			lng: fix.lng,
			accuracy_m: fix.accuracy_m,
			captured_at: fix.captured_at,
		});
		await repo.update('session_fix', fix.id, { lat: 0, lng: 0, accuracy_m: 0 });
		await repo.remove('session_fix', fix.id);
	}
}
