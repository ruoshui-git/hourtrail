import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Entity, Mutation, RecordOf } from '@hourtrail/core';

export type OutboxRow = {
	seq: number;
	mutation: Mutation;
	batch_id: string | null;
	queued_at: number;
};
export type LocalKey =
	| 'device_id'
	| 'device_name'
	| 'theme'
	| 'sync_cursor'
	| 'clock_offset_ms'
	| 'last_backup_at'
	| 'push_state'
	| 'capture_location';
export type LocalRow = { key: LocalKey; value: unknown };
export type LocalFix = Pick<
	RecordOf<'session_fix'>,
	'id' | 'session_id' | 'kind' | 'lat' | 'lng' | 'accuracy_m' | 'captured_at'
>;

// Keep historical versions here. Each new version declares its stores and an
// upgrade callback, with a previous-version fixture in upgrade.test.ts.
export const V1_STORES = {
	activity_type: 'id, updated_at',
	project: 'id, updated_at',
	work_item: 'id, name, pinned_at, archived_at, updated_at',
	session: 'id, start_at, end_at, work_item_id, updated_at',
	place: 'id, updated_at',
	session_fix: 'id, updated_at',
	review_mark: 'id, updated_at',
	day_review: 'id, updated_at',
	setting: 'id, updated_at',
	report_preset: 'id, updated_at',
	conflict: 'id, updated_at',
	outbox: '++seq',
	local_fix: 'id',
	local: 'key',
};

export class HourtrailDB extends Dexie {
	declare activity_type: Table<RecordOf<'activity_type'>, string>;
	declare project: Table<RecordOf<'project'>, string>;
	declare work_item: Table<RecordOf<'work_item'>, string>;
	declare session: Table<RecordOf<'session'>, string>;
	declare place: Table<RecordOf<'place'>, string>;
	declare session_fix: Table<RecordOf<'session_fix'>, string>;
	declare review_mark: Table<RecordOf<'review_mark'>, string>;
	declare day_review: Table<RecordOf<'day_review'>, string>;
	declare setting: Table<RecordOf<'setting'>, string>;
	declare report_preset: Table<RecordOf<'report_preset'>, string>;
	declare conflict: Table<RecordOf<'conflict'>, string>;
	declare outbox: Table<OutboxRow, number, Omit<OutboxRow, 'seq'> & { seq?: number }>;
	declare local_fix: Table<LocalFix, string>;
	declare local: Table<LocalRow, LocalKey>;

	constructor(name = 'hourtrail') {
		super(name);
		this.version(1).stores(V1_STORES);
	}

	entity<E extends Entity>(entity: E): Table<RecordOf<E>, string> {
		return this.table(entity);
	}
}

/** Dexie opens lazily on the first operation. */
export function openDb(name = 'hourtrail'): HourtrailDB {
	return new HourtrailDB(name);
}
