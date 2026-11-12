import { z } from 'zod';
import { ENTITIES, epochSchema, schemas, sessionFixId, uuidSchema } from '../schema';
import type { Entity, RecordOf } from '../schema';
import { dayOf } from '../time';

export const BACKUP_FORMAT = 'hourtrail-backup';
export const BACKUP_VERSION = 1;

/** Raw fixes have no sync metadata. Their presence here flags them as device-only. */
export const localFixSchema = z
	.strictObject({
		id: z.string(),
		session_id: uuidSchema,
		kind: z.enum(['start', 'end']),
		lat: z.number().min(-90).max(90),
		lng: z.number().min(-180).max(180),
		accuracy_m: z.number().nonnegative(),
		captured_at: epochSchema,
	})
	.refine((fix) => fix.id === sessionFixId(fix.session_id, fix.kind), {
		path: ['id'],
		message: 'Id must match session_id and kind',
	});
export type LocalFix = z.infer<typeof localFixSchema>;

export type BackupFile = {
	format: typeof BACKUP_FORMAT;
	version: typeof BACKUP_VERSION;
	exported_at: number;
	device: { id: string; name: string | null };
	counts: Record<Entity, number> & { local_fix: number };
	range: { first_start_at: number | null; last_start_at: number | null };
	records: { [E in Entity]: RecordOf<E>[] };
	local_fixes: LocalFix[];
};

export function buildBackup(input: {
	records: BackupFile['records'];
	localFixes: LocalFix[];
	exportedAt: number;
	device: BackupFile['device'];
}): BackupFile {
	const counts = Object.fromEntries(
		ENTITIES.map((entity) => [entity, input.records[entity].length]),
	) as Record<Entity, number>;
	let first: number | null = null;
	let last: number | null = null;
	for (const session of input.records.session) {
		if (session.deleted_at !== null) continue;
		first = first === null ? session.start_at : Math.min(first, session.start_at);
		last = last === null ? session.start_at : Math.max(last, session.start_at);
	}
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exported_at: input.exportedAt,
		device: input.device,
		counts: { ...counts, local_fix: input.localFixes.length },
		range: { first_start_at: first, last_start_at: last },
		records: input.records,
		local_fixes: input.localFixes,
	};
}

/** Canonical object key order, preserving array order and every own JSON key. */
export function serializeBackup(file: BackupFile): string {
	return JSON.stringify(
		file,
		(_key, value: unknown) =>
			value !== null && typeof value === 'object' && !Array.isArray(value)
				? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
				: value,
		2,
	);
}

const recordsSchema = z.strictObject({
	activity_type: schemas.activity_type.strict().array(),
	project: schemas.project.strict().array(),
	work_item: schemas.work_item.strict().array(),
	session: schemas.session.strict().array(),
	place: schemas.place.strict().array(),
	session_fix: schemas.session_fix.strict().array(),
	review_mark: schemas.review_mark.strict().array(),
	day_review: schemas.day_review.strict().array(),
	setting: schemas.setting.strict().array(),
	report_preset: schemas.report_preset.strict().array(),
	conflict: schemas.conflict.strict().array(),
}) satisfies z.ZodType<BackupFile['records']>;
const countsSchema = z.record(z.enum([...ENTITIES, 'local_fix']), z.int().nonnegative());
const backupSchema = z.strictObject({
	format: z.literal(BACKUP_FORMAT),
	version: z.literal(BACKUP_VERSION),
	exported_at: epochSchema,
	device: z.strictObject({ id: z.string(), name: z.string().nullable() }),
	counts: countsSchema,
	range: z.strictObject({
		first_start_at: epochSchema.nullable(),
		last_start_at: epochSchema.nullable(),
	}),
	records: recordsSchema,
	local_fixes: localFixSchema.array(),
});

export type ParsedBackup =
	| { ok: true; file: BackupFile }
	| {
			ok: false;
			error: 'not-json' | 'wrong-format' | 'newer-version' | 'invalid-record';
			detail: string;
	  };

export function parseBackup(text: string): ParsedBackup {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return { ok: false, error: 'not-json', detail: 'The file is not valid JSON.' };
	}
	if (
		value === null ||
		typeof value !== 'object' ||
		!('format' in value) ||
		value.format !== BACKUP_FORMAT
	) {
		return { ok: false, error: 'wrong-format', detail: 'Expected an Hourtrail backup file.' };
	}
	if ('version' in value && typeof value.version === 'number' && value.version > BACKUP_VERSION) {
		return { ok: false, error: 'newer-version', detail: 'This backup uses a newer file version.' };
	}
	const parsed = backupSchema.safeParse(value);
	if (!parsed.success) {
		return { ok: false, error: 'invalid-record', detail: parsed.error.message };
	}
	const file = parsed.data;
	const expected = buildBackup({
		records: file.records,
		localFixes: file.local_fixes,
		exportedAt: file.exported_at,
		device: file.device,
	});
	if (
		[...ENTITIES, 'local_fix' as const].some((key) => file.counts[key] !== expected.counts[key]) ||
		file.range.first_start_at !== expected.range.first_start_at ||
		file.range.last_start_at !== expected.range.last_start_at
	) {
		return { ok: false, error: 'invalid-record', detail: 'Counts or range do not match records.' };
	}
	return { ok: true, file };
}

export function backupFileName(exportedAt: number, tz: string): string {
	return `hourtrail-backup-${dayOf(exportedAt, tz)}.json`;
}
