import {
	applyMutation,
	DEFAULT_ACTIVITY_TYPES,
	deleteMutation,
	invertMutation,
	NEW_WORK_ITEM_TYPE_ID,
	newId,
	patchMutation,
	putMutation,
	schemas,
	undeleteMutation,
	WORK_TYPE_ID,
} from '@hourtrail/core';
import type { AnyRecord, Entity, Mutation, RecordOf } from '@hourtrail/core';
import type { HourtrailDB } from './schema';

export type Clock = () => number;
export type UndoToken = { label: string; mutations: Mutation[]; before: (AnyRecord | null)[] };
type Fields<E extends Entity> = Omit<
	RecordOf<E>,
	'id' | 'rev' | 'created_at' | 'updated_at' | 'deleted_at' | 'updated_by'
> & { id?: string };
type Session = RecordOf<'session'>;
type StartOptions = { workItemId?: string | null };
type Started = { session: Session; undo: UndoToken; alreadyRunning: boolean };
export interface Repo {
	deviceId(): Promise<string>;
	ensureSeeded(): Promise<void>;
	create<E extends Entity>(entity: E, fields: Fields<E>): Promise<RecordOf<E>>;
	update<E extends Entity>(
		entity: E,
		id: string,
		changes: Partial<RecordOf<E>>,
	): Promise<RecordOf<E> | null>;
	remove(entity: Entity, id: string): Promise<UndoToken>;
	restore(entity: Entity, id: string): Promise<void>;
	running(): Promise<Session[]>;
	start(opts?: StartOptions): Promise<Started>;
	startNamed(
		name: string,
	): Promise<{ session: Session; workItem: RecordOf<'work_item'>; undo: UndoToken }>;
	stop(): Promise<{ session: Session; undo: UndoToken } | null>;
	switchTo(opts: {
		workItemId: string | null;
	}): Promise<{ stopped: Session | null; started: Session; undo: UndoToken }>;
	undo(token: UndoToken): Promise<void>;
}

type Context = { now: number; deviceId: string };
const token = (label: string): UndoToken => ({ label, mutations: [], before: [] });

export function createRepo(
	db: HourtrailDB,
	clock: Clock = Date.now,
	zone: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): Repo {
	function transaction<T>(entities: Entity[], action: (now: number) => Promise<T>): Promise<T> {
		const stores = [...new Set([...entities, 'conflict', 'outbox', 'local'])];
		return db.transaction(
			'rw',
			stores.map((name) => db.table(name)),
			async () => await action(clock()),
		);
	}

	// Called only within the caller's transaction: an aborted first write also
	// rolls back device identity. Never cache an identity before commit.
	async function identity(now: number): Promise<string> {
		const row = await db.local.get('device_id');
		if (row) {
			if (typeof row.value !== 'string') throw new Error('Invalid local device_id');
			return row.value;
		}
		const id = newId(now);
		await db.local.put({ key: 'device_id', value: id });
		return id;
	}
	async function context(now: number): Promise<Context> {
		return { now, deviceId: await identity(now) };
	}
	async function required(entity: Entity, id: string): Promise<AnyRecord> {
		const record = await db.entity(entity).get(id);
		if (!record) throw new Error(`Missing ${entity}: ${id}`);
		return record;
	}
	async function write(mutation: Mutation, ctx: Context, undo?: UndoToken): Promise<AnyRecord> {
		const table = db.entity(mutation.entity);
		const before = (await table.get(mutation.record_id)) ?? null;
		const result = applyMutation(before, mutation, { now: ctx.now });
		if (!result.next) throw new Error(`Missing ${mutation.entity}: ${mutation.record_id}`);
		schemas[mutation.entity].parse(result.next);
		await table.put(result.next);
		await db.outbox.add({ mutation, batch_id: null, queued_at: ctx.now });
		if (undo) {
			undo.mutations.push(mutation);
			undo.before.push(before);
		}
		// Local inverse edits can themselves conflict after intervening edits.
		// Preserve those records through the same write/outbox path.
		for (const conflict of result.conflicts) {
			await write(putMutation('conflict', conflict, ctx), ctx);
		}
		return result.next;
	}
	async function create<E extends Entity>(
		entity: E,
		fields: Fields<E>,
		ctx: Context,
		undo?: UndoToken,
	): Promise<RecordOf<E>> {
		const record = {
			...fields,
			id: fields.id ?? newId(ctx.now),
			rev: 0,
			created_at: ctx.now,
			updated_at: ctx.now,
			updated_by: ctx.deviceId,
			deleted_at: null,
		} as RecordOf<E>;
		return (await write(putMutation(entity, record, ctx), ctx, undo)) as RecordOf<E>;
	}
	async function patch<E extends Entity>(
		entity: E,
		before: RecordOf<E>,
		changes: Partial<RecordOf<E>>,
		ctx: Context,
		undo?: UndoToken,
	): Promise<RecordOf<E> | null> {
		const mutation = patchMutation(entity, before, changes, ctx);
		return mutation ? ((await write(mutation, ctx, undo)) as RecordOf<E>) : null;
	}
	async function running(): Promise<Session[]> {
		// IndexedDB does not index null values (including end_at).
		return db.session
			.orderBy('start_at')
			.filter((s) => s.end_at === null && s.deleted_at === null)
			.toArray();
	}
	async function start(workItemId: string | null, ctx: Context, undo: UndoToken): Promise<Session> {
		const item = workItemId ? await db.work_item.get(workItemId) : undefined;
		return create(
			'session',
			{
				work_item_id: workItemId,
				type_id: item?.type_id ?? NEW_WORK_ITEM_TYPE_ID,
				start_at: ctx.now,
				start_tz: zone(),
				end_at: null,
				end_tz: null,
				note: '',
				source: 'live',
				place_id: null,
				place_state: 'none',
				place_candidates: [],
				flags: {},
				origin_device_id: ctx.deviceId,
			},
			ctx,
			undo,
		);
	}
	async function stop(session: Session, ctx: Context, undo: UndoToken): Promise<Session> {
		return (await patch('session', session, { end_at: ctx.now, end_tz: zone() }, ctx, undo))!;
	}

	return {
		deviceId: () => transaction([], identity),
		ensureSeeded: () =>
			transaction(['activity_type'], async (now) => {
				for (const type of DEFAULT_ACTIVITY_TYPES) {
					if (await db.activity_type.get(type.id)) continue;
					const ctx = { now: 0, deviceId: await identity(now) };
					await write(putMutation('activity_type', { ...type, updated_by: ctx.deviceId }, ctx), {
						...ctx,
						now,
					});
				}
			}),
		create: (entity, fields) =>
			transaction([entity], async (now) => create(entity, fields, await context(now))),
		update: (entity, id, changes) =>
			transaction([entity], async (now) => {
				const before = await db.entity(entity).get(id);
				if (!before) return null;
				// Check no-ops before creating a device id.
				const existing = await db.local.get('device_id');
				const mutation = patchMutation(entity, before, changes, {
					now,
					deviceId: typeof existing?.value === 'string' ? existing.value : '',
				});
				if (!mutation) return null;
				const ctx = await context(now);
				return (await write({ ...mutation, device_id: ctx.deviceId }, ctx)) as RecordOf<
					typeof entity
				>;
			}),
		remove: (entity, id) =>
			transaction([entity], async (now) => {
				await required(entity, id);
				const undo = token('Delete');
				const ctx = await context(now);
				await write(deleteMutation(entity, id, ctx), ctx, undo);
				return undo;
			}),
		restore: (entity, id) =>
			transaction([entity], async (now) => {
				await required(entity, id);
				const ctx = await context(now);
				await write(undeleteMutation(entity, id, ctx), ctx);
			}),
		running,
		start: (opts = {}) =>
			transaction(['session', 'work_item'], async (now) => {
				const undo = token('Start');
				const current = (await running())[0];
				if (current) return { session: current, undo, alreadyRunning: true };
				const session = await start(opts.workItemId ?? null, await context(now), undo);
				return { session, undo, alreadyRunning: false };
			}),
		startNamed: (name) =>
			transaction(['session', 'work_item'], async (now) => {
				const undo = token('Start');
				const ctx = await context(now);
				let workItem = await db.work_item
					.where('name')
					.equals(name)
					.filter((item) => item.archived_at === null && item.deleted_at === null)
					.first();
				workItem ??= await create(
					'work_item',
					{
						name,
						description: '',
						type_id: WORK_TYPE_ID,
						project_id: null,
						place_id: null,
						pinned_at: null,
						pin_sort: 0,
						archived_at: null,
					},
					ctx,
					undo,
				);
				const session = (await running())[0] ?? (await start(workItem.id, ctx, undo));
				return { session, workItem, undo };
			}),
		stop: () =>
			transaction(['session'], async (now) => {
				const current = (await running()).at(-1);
				if (!current) return null;
				const undo = token('Stop');
				return { session: await stop(current, await context(now), undo), undo };
			}),
		switchTo: (opts) =>
			transaction(['session', 'work_item'], async (now) => {
				const undo = token('Switch');
				const ctx = await context(now);
				const current = (await running()).at(-1);
				const stopped = current ? await stop(current, ctx, undo) : null;
				const started = await start(opts.workItemId, ctx, undo);
				return { stopped, started, undo };
			}),
		undo: (undo) =>
			transaction(
				undo.mutations.map((m) => m.entity),
				async (now) => {
					if (undo.mutations.length !== undo.before.length) throw new Error('Invalid undo token');
					if (!undo.mutations.length) return;
					const ctx = await context(now);
					for (let i = undo.mutations.length - 1; i >= 0; i--) {
						for (const inverse of invertMutation(undo.mutations[i]!, undo.before[i]!, ctx)) {
							await write(inverse, ctx);
						}
					}
				},
			),
	};
}
