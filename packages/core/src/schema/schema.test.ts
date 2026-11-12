import { describe, expect, expectTypeOf, it } from 'vitest';
import {
	DEFAULT_ACTIVITY_TYPES,
	ENTITIES,
	OVERHEAD_TYPE_ID,
	PERSONAL_TYPE_ID,
	SETTING_DEFAULTS,
	VOLUNTEER_TYPE_ID,
	WORK_TYPE_ID,
	readSetting,
	reviewMarkId,
	schemas,
	sessionFixId,
	settingSchemas,
} from './index';
import type { Entity, RecordOf, SettingKey } from './index';

const id = '01234567-89ab-7cde-8fab-0123456789ab';
const otherId = '550e8400-e29b-41d4-a716-446655440000';
const text = '  库存管理系统开发 · 第1寺院 / 修复洗手台 🛠️ 👩🏽‍💻，"hello"! e\u0301\n\t';
const common = { id, rev: 0, created_at: 123, updated_at: 456, deleted_at: null };
const fixtures: { [E in Entity]: RecordOf<E> } = {
	activity_type: {
		...common,
		name: text,
		color: 'rose',
		sort_key: 1.5,
		counts_as_work: false,
		remind: true,
		archived_at: null,
	},
	project: { ...common, name: text, archived_at: null },
	work_item: {
		...common,
		name: text,
		description: text,
		type_id: WORK_TYPE_ID,
		project_id: otherId,
		place_id: otherId,
		pinned_at: null,
		pin_sort: 2.5,
		archived_at: null,
	},
	session: {
		...common,
		work_item_id: null,
		type_id: WORK_TYPE_ID,
		start_at: 100,
		end_at: null,
		start_tz: 'America/New_York',
		end_tz: null,
		note: text,
		source: 'live',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: text,
		flags: {},
	},
	place: {
		...common,
		name: text,
		lat: 45.5,
		lng: -63.5,
		radius_m: 100,
		description: text,
		archived_at: null,
	},
	session_fix: {
		...common,
		id: sessionFixId(id, 'start'),
		session_id: id,
		kind: 'start',
		lat: 45.5,
		lng: -63.5,
		accuracy_m: 12.3,
		captured_at: 300,
	},
	review_mark: {
		...common,
		id: reviewMarkId('2026-11-12', text),
		day: '2026-11-12',
		issue_key: text,
		state: 'reviewed',
	},
	day_review: { ...common, id: '2026-11-12', finished_at: 500 },
	setting: { ...common, id: 'reporting_tz', value: 'Asia/Shanghai' },
	report_preset: {
		...common,
		name: text,
		config: { title: text, headings: { note: text }, type_ids: [id] },
	},
	conflict: {
		...common,
		entity: 'review_mark',
		record_id: reviewMarkId('2026-11-12', text),
		field: text,
		kept_value: { text },
		other_value: [null, true, 1.5, text],
		kept_device: text,
		other_device: text,
		at: 500,
		resolved_at: null,
	},
};

describe('synced record schemas', () => {
	it.each(ENTITIES)('accepts a %s and preserves all Unicode and JSON fields exactly', (entity) => {
		const original = fixtures[entity];
		const parsed = schemas[entity].parse(original);
		expect(parsed).toEqual(original);
		expect(JSON.stringify(parsed)).toBe(JSON.stringify(original));
	});

	it.each(ENTITIES)('enforces common fields on %s and preserves tombstones', (entity) => {
		const schema = schemas[entity];
		for (const invalid of [
			{ rev: -1 },
			{ rev: 1.1 },
			{ rev: '1' },
			{ created_at: 0.1 },
			{ updated_at: null },
			{ deleted_at: '0' },
			{ deleted_at: undefined },
			{ created_at: Infinity },
		]) {
			expect(schema.safeParse({ ...fixtures[entity], ...invalid }).success).toBe(false);
		}
		expect(schema.parse({ ...fixtures[entity], deleted_at: 600, rev: 10 })).toMatchObject({
			deleted_at: 600,
			rev: 10,
		});
	});

	it.each([
		['activity_type', { name: 1 }],
		['activity_type', { color: 'blue' }],
		['activity_type', { counts_as_work: 1 }],
		['activity_type', { remind: 'true' }],
		['project', { archived_at: false }],
		['work_item', { type_id: 'Work' }],
		['work_item', { project_id: 1 }],
		['work_item', { pin_sort: '1' }],
		['session', { source: 'imported' }],
		['session', { place_state: 'unknown' }],
		['session', { start_at: 1.5 }],
		['session', { end_at: '200' }],
		['session', { start_tz: 'not/a-zone' }],
		['session', { end_tz: '+01:00' }],
		['session', { place_candidates: ['invalid'] }],
		['session', { flags: { clock_suspect: 1 } }],
		['session', { work_item_id: undefined }],
		['session', { place_id: undefined }],
		['session', { note: undefined }],
		['session_fix', { kind: 'middle' }],
		['review_mark', { state: 'open' }],
		['day_review', { id: '2026-02-29' }],
		['setting', { id: 'unknown_setting' }],
		['setting', { value: undefined }],
		['report_preset', { config: { value: undefined } }],
		['report_preset', { config: Infinity }],
		['conflict', { entity: 'outbox' }],
		['conflict', { kept_value: () => 1 }],
	] satisfies [Entity, object][])('rejects invalid %s fields %j', (entity, invalid) => {
		expect(schemas[entity].safeParse({ ...fixtures[entity], ...invalid }).success).toBe(false);
	});

	it('rejects malformed ids on ordinary entities', () => {
		for (const entity of [
			'activity_type',
			'project',
			'work_item',
			'session',
			'place',
			'report_preset',
			'conflict',
		] as const) {
			for (const invalid of ['invalid', id.toUpperCase(), '2026-11-12', `${id}:start`]) {
				expect(schemas[entity].safeParse({ ...fixtures[entity], id: invalid }).success).toBe(false);
			}
		}
	});

	it('validates deterministic ids against their component fields', () => {
		expect(sessionFixId(id, 'end')).toBe(`${id}:end`);
		expect(reviewMarkId('2026-11-12', 'gap|库存')).toBe('2026-11-12|gap|库存');
		expect(schemas.session_fix.safeParse({ ...fixtures.session_fix, kind: 'end' }).success).toBe(
			false,
		);
		expect(
			schemas.session_fix.safeParse({ ...fixtures.session_fix, session_id: otherId }).success,
		).toBe(false);
		expect(
			schemas.review_mark.safeParse({ ...fixtures.review_mark, day: '2026-11-13' }).success,
		).toBe(false);
		expect(
			schemas.review_mark.safeParse({ ...fixtures.review_mark, issue_key: 'different' }).success,
		).toBe(false);
		expect(
			schemas.review_mark.safeParse({
				...fixtures.review_mark,
				id: '2026-02-29|x',
				day: '2026-02-29',
				issue_key: 'x',
			}).success,
		).toBe(false);
	});

	it('accepts closed, negative-duration and clock-suspect sessions as record shapes', () => {
		const session = {
			...fixtures.session,
			start_at: 200,
			end_at: 100,
			end_tz: 'Asia/Tokyo',
			work_item_id: otherId,
			flags: { clock_suspect: true },
		};
		expect(schemas.session.parse(session)).toEqual(session);
		for (const place_state of [
			'none',
			'pending',
			'set',
			'suggested',
			'ambiguous',
			'unresolved',
			'dismissed',
		] as const) {
			expect(
				schemas.session.parse({
					...session,
					place_state,
					place_id: otherId,
					place_candidates: [id, otherId],
					note: '',
				}),
			).toMatchObject({ place_state, note: '' });
		}
		expect(schemas.session.parse({ ...session, source: 'manual' }).source).toBe('manual');
	});

	it('requires every work item association to be present, allowing null', () => {
		expect(
			schemas.work_item.parse({
				...fixtures.work_item,
				project_id: null,
				place_id: null,
				pinned_at: null,
			}),
		).toMatchObject({ project_id: null, place_id: null, pinned_at: null });
		// Absent and null must not both be valid: the merge compares stored values with `from`.
		for (const field of ['type_id', 'project_id', 'place_id', 'pinned_at'] as const) {
			const { [field]: _omitted, ...item } = fixtures.work_item;
			expect(schemas.work_item.safeParse(item).success, field).toBe(false);
		}
		expect(WORK_TYPE_ID).toBe('00000000-0000-7000-8000-000000000001');
	});

	it('requires radius and enforces inclusive integer bounds and coordinate shapes', () => {
		const { radius_m: _radius, ...place } = fixtures.place;
		expect(schemas.place.safeParse(place).success).toBe(false);
		for (const radius_m of [25, 100, 2000])
			expect(schemas.place.parse({ ...place, radius_m }).radius_m).toBe(radius_m);
		for (const radius_m of [24, 2001, 25.5, '100', null])
			expect(schemas.place.safeParse({ ...place, radius_m }).success).toBe(false);
		for (const invalid of [{ lat: 91 }, { lng: -181 }, { lat: '45' }, { lng: NaN }])
			expect(schemas.place.safeParse({ ...place, ...invalid }).success).toBe(false);
	});

	it('exports precise entity-indexed types', () => {
		expectTypeOf<RecordOf<'session'>['source']>().toEqualTypeOf<'live' | 'manual'>();
		expectTypeOf<RecordOf<'activity_type'>['color']>().toEqualTypeOf<
			(typeof DEFAULT_ACTIVITY_TYPES)[number]['color']
		>();
		expect(Object.keys(schemas)).toEqual([...ENTITIES]);
	});
});

describe('settings and default activity types', () => {
	it('seeds the exact four deterministic activity types', () => {
		expect(DEFAULT_ACTIVITY_TYPES).toEqual([
			{
				id: WORK_TYPE_ID,
				name: 'Work',
				color: 'lake',
				counts_as_work: true,
				remind: true,
				sort_key: 1,
				rev: 0,
				created_at: 0,
				updated_at: 0,
				deleted_at: null,
				archived_at: null,
			},
			{
				id: OVERHEAD_TYPE_ID,
				name: 'Overhead',
				color: 'rose',
				counts_as_work: false,
				remind: true,
				sort_key: 2,
				rev: 0,
				created_at: 0,
				updated_at: 0,
				deleted_at: null,
				archived_at: null,
			},
			{
				id: VOLUNTEER_TYPE_ID,
				name: 'Volunteer',
				color: 'saffron',
				counts_as_work: false,
				remind: true,
				sort_key: 3,
				rev: 0,
				created_at: 0,
				updated_at: 0,
				deleted_at: null,
				archived_at: null,
			},
			{
				id: PERSONAL_TYPE_ID,
				name: 'Personal',
				color: 'fern',
				counts_as_work: false,
				remind: false,
				sort_key: 4,
				rev: 0,
				created_at: 0,
				updated_at: 0,
				deleted_at: null,
				archived_at: null,
			},
		]);
		expect(DEFAULT_ACTIVITY_TYPES.map((type) => type.id)).toEqual(
			[1, 2, 3, 4].map((n) => `00000000-0000-7000-8000-00000000000${n}`),
		);
		for (const type of DEFAULT_ACTIVITY_TYPES)
			expect(schemas.activity_type.parse(type)).toEqual(type);
	});

	it('exposes exact setting defaults and falls back for missing and invalid values', () => {
		expect(SETTING_DEFAULTS).toEqual({
			reporting_tz: null,
			week_start: 1,
			reminder: { enabled: false, threshold_min: 240, repeat_min: null },
			sync_raw_gps: false,
			long_gap_min: 60,
			long_session_min: 600,
			note_prompt: 'work',
			duration_format: 'hm',
		});
		for (const key of Object.keys(settingSchemas) as SettingKey[]) {
			expect(readSetting(key, undefined)).toEqual(SETTING_DEFAULTS[key]);
			expect(readSetting(key, { invalid: true })).toEqual(SETTING_DEFAULTS[key]);
			expect(readSetting(key, SETTING_DEFAULTS[key])).toEqual(SETTING_DEFAULTS[key]);
		}
		expectTypeOf(readSetting('reporting_tz', undefined)).toEqualTypeOf<string | null>();
		expectTypeOf(readSetting('week_start', undefined)).toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6 | 7>();
	});

	it('parses every setting and rejects wrong types and enum values', () => {
		expect(readSetting('reporting_tz', 'Asia/Shanghai')).toBe('Asia/Shanghai');
		expect(readSetting('reporting_tz', 'invalid')).toBeNull();
		for (const week of [1, 2, 3, 4, 5, 6, 7]) expect(readSetting('week_start', week)).toBe(week);
		for (const week of [0, 8, 1.5, '7']) expect(readSetting('week_start', week)).toBe(1);
		expect(readSetting('reminder', { enabled: true, threshold_min: 120, repeat_min: 30 })).toEqual({
			enabled: true,
			threshold_min: 120,
			repeat_min: 30,
		});
		expect(
			readSetting('reminder', { enabled: true, threshold_min: '120', repeat_min: null }),
		).toEqual(SETTING_DEFAULTS.reminder);
		expect(readSetting('sync_raw_gps', true)).toBe(true);
		expect(readSetting('long_gap_min', 90)).toBe(90);
		expect(readSetting('long_session_min', 720)).toBe(720);
		for (const value of ['work', 'all', 'none'])
			expect(readSetting('note_prompt', value)).toBe(value);
		expect(readSetting('note_prompt', 'some')).toBe('work');
		expect(readSetting('duration_format', 'decimal')).toBe('decimal');
		expect(readSetting('duration_format', 'minutes')).toBe('hm');
	});

	it('returns independent reminder defaults', () => {
		const first = readSetting('reminder', undefined);
		first.enabled = true;
		expect(readSetting('reminder', undefined).enabled).toBe(false);
		expect(SETTING_DEFAULTS.reminder.enabled).toBe(false);
	});
});
