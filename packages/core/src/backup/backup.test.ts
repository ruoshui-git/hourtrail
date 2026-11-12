import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVITY_TYPES, ENTITIES, newId, sessionFixId, WORK_TYPE_ID } from '../index';
import { backupFileName, buildBackup, localFixSchema, parseBackup, serializeBackup } from './index';
import type { BackupFile, LocalFix } from './index';

const text = '库存管理系统开发 · 第1寺院 · 修复洗手台 🛠️ 👩🏽‍💻';
const id = newId();
const common = {
	id,
	rev: 2,
	created_at: 100,
	updated_at: 200,
	updated_by: 'device-a',
	deleted_at: null,
};
const json = JSON.parse('{"__proto__":{"text":"库存管理系统开发"},"nested":[null,true,2,"👩🏽‍💻"]}');
const localFix: LocalFix = {
	id: sessionFixId(id, 'start'),
	session_id: id,
	kind: 'start',
	lat: 44,
	lng: -63,
	accuracy_m: 35,
	captured_at: 120,
};

function fixture(): BackupFile {
	const records: BackupFile['records'] = {
		activity_type: [...DEFAULT_ACTIVITY_TYPES],
		project: [{ ...common, name: text, archived_at: null }],
		work_item: [
			{
				...common,
				name: text,
				description: text,
				type_id: WORK_TYPE_ID,
				project_id: id,
				place_id: id,
				pinned_at: null,
				pin_sort: 1,
				archived_at: null,
			},
		],
		session: [
			{
				...common,
				work_item_id: id,
				type_id: WORK_TYPE_ID,
				start_at: 120,
				end_at: 180,
				start_tz: 'America/New_York',
				end_tz: 'America/New_York',
				note: text,
				source: 'manual',
				place_id: id,
				place_state: 'set',
				place_candidates: [id],
				origin_device_id: 'device-a',
				flags: { clock_suspect: true },
			},
		],
		place: [
			{
				...common,
				name: text,
				lat: 44,
				lng: -63,
				radius_m: 100,
				description: text,
				archived_at: null,
			},
		],
		session_fix: [{ ...common, ...localFix }],
		review_mark: [
			{
				...common,
				id: '2026-11-12|gap',
				day: '2026-11-12',
				issue_key: 'gap',
				state: 'dismissed',
			},
		],
		day_review: [{ ...common, id: '2026-11-12', finished_at: 180 }],
		setting: [{ ...common, id: 'reminder', value: json }],
		report_preset: [{ ...common, name: text, config: json }],
		conflict: [
			{
				...common,
				entity: 'work_item',
				record_id: id,
				field: 'name',
				kept_value: text,
				other_value: json,
				kept_device: 'device-a',
				other_device: 'device-b',
				at: 200,
				resolved_at: null,
			},
		],
	};
	// Keep a tombstone for every entity; deterministic ids remain unchanged.
	for (const entity of ENTITIES) {
		const record = records[entity][0]!;
		(records[entity] as (typeof record)[]).push({ ...record, deleted_at: 250 });
	}
	return buildBackup({
		records,
		localFixes: [localFix],
		exportedAt: 300,
		device: { id: 'device-a', name: text },
	});
}

describe('portable backups', () => {
	it('round trips every entity, relationships, tombstones, conflicts, settings and raw local fixes', () => {
		const file = fixture();
		const encoded = serializeBackup(file);
		const parsed = parseBackup(encoded);
		expect(parsed).toEqual({ ok: true, file });
		expect(encoded).toContain(text);
		expect(encoded).not.toContain('\\u5e93');
		if (!parsed.ok) throw new Error(parsed.detail);
		expect(Object.hasOwn(parsed.file.records.setting[0]!.value as object, '__proto__')).toBe(true);
		expect(parsed.file.records.setting[0]!.value).toEqual(json);
		expect(parsed.file.records.conflict[0]!.other_value).toEqual(json);
		expect(parsed.file.local_fixes).toEqual([localFix]);
		for (const entity of ENTITIES) expect(file.counts[entity]).toBe(file.records[entity].length);
		expect(file.counts.local_fix).toBe(1);
	});

	it('uses a stable key order and two-space indentation without reordering arrays', () => {
		const file = fixture();
		const reordered = Object.fromEntries(Object.entries(file).reverse()) as BackupFile;
		reordered.records = {
			...file.records,
			setting: [{ ...file.records.setting[0]!, value: { z: 1, a: json } }],
		};
		const other = {
			...reordered,
			records: {
				...reordered.records,
				setting: [{ ...reordered.records.setting[0]!, value: { a: json, z: 1 } }],
			},
		};
		expect(serializeBackup(reordered)).toBe(serializeBackup(other));
		expect(serializeBackup(file)).toContain('\n  "counts": {');
		expect(parseBackup(serializeBackup(file))).toEqual({ ok: true, file });
	});

	it('derives the range from non-deleted session starts, including running sessions', () => {
		const file = fixture();
		file.records.session.push({ ...file.records.session[0]!, start_at: 220, end_at: null });
		file.records.session[1]!.start_at = -1000;
		const build = () =>
			buildBackup({ records: file.records, localFixes: [], exportedAt: 300, device: file.device });
		expect(build().range).toEqual({ first_start_at: 120, last_start_at: 220 });
		file.records.session = file.records.session.filter((session) => session.deleted_at !== null);
		expect(build().range).toEqual({ first_start_at: null, last_start_at: null });
		file.records.session = [];
		expect(build().range).toEqual({ first_start_at: null, last_start_at: null });
	});

	it.each([
		['not-json', '{'],
		['wrong-format', 'null'],
		['wrong-format', JSON.stringify({ ...fixture(), format: 'other' })],
		['newer-version', JSON.stringify({ ...fixture(), version: 2 })],
		['invalid-record', JSON.stringify({ ...fixture(), version: 0 })],
		['invalid-record', JSON.stringify({ ...fixture(), exported_at: '300' })],
		[
			'invalid-record',
			JSON.stringify({ ...fixture(), records: { ...fixture().records, unknown: [] } }),
		],
		[
			'invalid-record',
			JSON.stringify({ ...fixture(), counts: { ...fixture().counts, session: 99 } }),
		],
		[
			'invalid-record',
			JSON.stringify({ ...fixture(), range: { first_start_at: 0, last_start_at: 0 } }),
		],
	])('rejects %s input', (error, input) => {
		expect(parseBackup(input)).toMatchObject({ ok: false, error, detail: expect.any(String) });
	});

	it.each(ENTITIES)('validates every %s record rather than just the envelope', (entity) => {
		const file = fixture();
		file.records[entity][1]!.rev = -1;
		expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: 'invalid-record' });
	});

	it('rejects missing entities and unknown record fields instead of silently dropping data', () => {
		const file = fixture();
		const { project: _project, ...records } = file.records;
		expect(parseBackup(JSON.stringify({ ...file, records }))).toMatchObject({
			ok: false,
			error: 'invalid-record',
		});
		Object.assign(file.records.project[0]!, { unexpected: text });
		expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: 'invalid-record' });
	});

	it.each([
		{ id: 'wrong:start' },
		{ session_id: 'wrong' },
		{ kind: 'middle' },
		{ lat: 91 },
		{ lng: -181 },
		{ accuracy_m: -1 },
		{ captured_at: 1.5 },
		{ rev: 0 },
	])('strictly validates device-only GPS fixes: %j', (invalid) => {
		expect(localFixSchema.safeParse(localFix).success).toBe(true);
		const file = fixture();
		Object.assign((file.local_fixes[0] = { ...localFix }), invalid);
		expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: 'invalid-record' });
	});

	it('names the file for the reporting day rather than the UTC day', () => {
		const instant = Date.parse('2026-11-13T04:30:00Z');
		expect(backupFileName(instant, 'America/New_York')).toBe('hourtrail-backup-2026-11-12.json');
		expect(backupFileName(instant, 'Asia/Shanghai')).toBe('hourtrail-backup-2026-11-13.json');
	});
});
