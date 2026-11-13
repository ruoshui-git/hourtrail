import {
	applyMutation,
	DEFAULT_ACTIVITY_TYPES,
	deleteMutation,
	ENTITIES,
	localFixSchema,
	invertMutation,
	NEW_WORK_ITEM_TYPE_ID,
	newId,
	patchMutation,
	putMutation,
	schemas,
	undeleteMutation,
	WORK_TYPE_ID,
} from '@hourtrail/core';
import type { AnyRecord, BackupFile, Entity, Mutation, RecordOf } from '@hourtrail/core';
import type { HourtrailDB } from './schema';
import { clockSuspect } from '$lib/features/clock/clock';

export type RestoreMode = 'add-missing' | 'replace';
export type RestoreCounts = { added: number; skipped: number; replaced: number; removed: number };
export type RestoreProgress = (completed: number, total: number) => void;

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
	restoreRecords(
		input: BackupFile,
		mode: RestoreMode,
		onProgress?: RestoreProgress,
	): Promise<RestoreCounts>;
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
	/**
	 * Patch several records in one transaction with one undo token (for example
	 * resolving two running sessions, or reassigning sessions when merging places).
	 * Edits that change nothing are skipped; a missing record throws and nothing is written.
	 */
	editMany(
		label: string,
		edits: { entity: Entity; id: string; changes: Record<string, unknown> }[],
	): Promise<UndoToken>;
	/**
	 * Apply a core plan (for example planSplit or planMerge for sessions) in one
	 * transaction with one undo token: creates, then updates, then removals.
	 */
	applyPlan<E extends Entity>(
		label: string,
		entity: E,
		plan: {
			create: (Fields<E> & { id: string })[];
			update: { id: string; changes: Record<string, unknown> }[];
			remove: string[];
		},
	): Promise<UndoToken>;
	undo(token: UndoToken): Promise<void>;
}

type Context = { now: number; deviceId: string; clockSuspect: boolean };
const token = (label: string): UndoToken => ({ label, mutations: [], before: [] });

export function createRepo(
	db: HourtrailDB,
	clock: Clock = Date.now,
	zone: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): Repo {
	function transaction<T>(
		entities: Entity[],
		action: (now: number, suspect: boolean) => Promise<T>,
	): Promise<T> {
		const stores = [...new Set([...entities, 'conflict', 'outbox', 'local'])];
		const suspect = clockSuspect();
		return db.transaction(
			'rw',
			stores.map((name) => db.table(name)),
			async () => await action(clock(), suspect),
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
	async function context(now: number, suspect = clockSuspect()): Promise<Context> {
		return { now, deviceId: await identity(now), clockSuspect: suspect };
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
				flags: ctx.clockSuspect ? { clock_suspect: true } : {},
				origin_device_id: ctx.deviceId,
			},
			ctx,
			undo,
		);
	}
	async function stop(session: Session, ctx: Context, undo: UndoToken): Promise<Session> {
		return (await patch(
			'session',
			session,
			{
				end_at: ctx.now,
				end_tz: zone(),
				...(ctx.clockSuspect ? { flags: { ...session.flags, clock_suspect: true } } : {}),
			},
			ctx,
			undo,
		))!;
	}

	async function restoreRecords(
		input: BackupFile,
		mode: RestoreMode,
		onProgress?: RestoreProgress,
	): Promise<RestoreCounts> {
		type Operation =
			| { kind: 'put'; entity: Entity; record: AnyRecord }
			| { kind: 'delete'; entity: Entity; id: string }
			| { kind: 'fix'; record: BackupFile['local_fixes'][number] }
			| { kind: 'remove-fix'; id: string };
		const operations: Operation[] = [];
		// Validate the entire input before the first chunk can commit.
		for (const entity of ENTITIES) {
			for (const record of input.records[entity]) {
				schemas[entity].parse(record);
				operations.push({ kind: 'put', entity, record });
			}
		}
		for (const record of input.local_fixes) {
			localFixSchema.parse(record);
			operations.push({ kind: 'fix', record });
		}
		if (mode === 'replace') {
			await db.transaction('r', [...ENTITIES, 'local_fix'], async () => {
				for (const entity of ENTITIES) {
					const ids = new Set(input.records[entity].map((record) => record.id));
					for (const id of await db.entity(entity).toCollection().primaryKeys()) {
						if (!ids.has(id)) operations.push({ kind: 'delete', entity, id });
					}
				}
				const fixes = new Set(input.local_fixes.map((fix) => fix.id));
				for (const id of await db.local_fix.toCollection().primaryKeys()) {
					if (!fixes.has(id)) operations.push({ kind: 'remove-fix', id });
				}
			});
		}
		const counts: RestoreCounts = { added: 0, skipped: 0, replaced: 0, removed: 0 };
		const at = clock();
		onProgress?.(0, operations.length);
		for (let offset = 0; offset < operations.length; offset += 500) {
			const chunk = operations.slice(offset, offset + 500);
			await db.transaction('rw', [...ENTITIES, 'local_fix', 'outbox', 'local'], async () => {
				const ctx = await context(at);
				const queue = async (mutation: Mutation, restore = false) => {
					await db.outbox.add({
						mutation,
						batch_id: null,
						queued_at: at,
						...(restore ? { mode: 'restore' as const } : {}),
					});
				};
				for (const operation of chunk) {
					if (operation.kind === 'put') {
						const { entity, record } = operation;
						const present = await db.entity(entity).get(record.id);
						if (mode === 'add-missing' && present) {
							counts.skipped++;
							continue;
						}
						await db.entity(entity).put(record);
						if (mode === 'replace') {
							// Keep each deletion-state transition adjacent to its put in queue order.
							await queue(undeleteMutation(entity, record.id, ctx));
							await queue(putMutation(entity, { ...record, deleted_at: null }, ctx), true);
							if (record.deleted_at !== null) await queue(deleteMutation(entity, record.id, ctx));
						} else await queue(putMutation(entity, record, ctx));
						if (present) counts.replaced++;
						else counts.added++;
					} else if (operation.kind === 'delete') {
						const before = await db.entity(operation.entity).get(operation.id);
						if (!before) continue;
						const mutation = deleteMutation(operation.entity, operation.id, ctx);
						const { next } = applyMutation(before, mutation, { now: at });
						if (next) await db.entity(operation.entity).put(next);
						await queue(mutation);
						counts.removed++;
					} else if (operation.kind === 'fix') {
						const present = await db.local_fix.get(operation.record.id);
						if (mode === 'add-missing' && present) {
							counts.skipped++;
							continue;
						}
						await db.local_fix.put(operation.record);
						if (present) counts.replaced++;
						else counts.added++;
					} else {
						await db.local_fix.delete(operation.id);
						counts.removed++;
					}
				}
			});
			onProgress?.(Math.min(offset + chunk.length, operations.length), operations.length);
			// Yield between committed chunks so the progress line can paint.
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
		await db.local.put({
			key: 'last_restore',
			value: { at, mode, exported_at: input.exported_at, counts },
		});
		return counts;
	}

	return {
		restoreRecords,
		deviceId: () => transaction([], identity),
		ensureSeeded: () =>
			transaction(['activity_type'], async (now) => {
				for (const type of DEFAULT_ACTIVITY_TYPES) {
					if (await db.activity_type.get(type.id)) continue;
					const ctx = { now: 0, deviceId: await identity(now), clockSuspect: false };
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
			transaction(['session', 'work_item'], async (now, suspect) => {
				const undo = token('Start');
				const current = (await running())[0];
				if (current) return { session: current, undo, alreadyRunning: true };
				const session = await start(opts.workItemId ?? null, await context(now, suspect), undo);
				return { session, undo, alreadyRunning: false };
			}),
		startNamed: (name) =>
			transaction(['session', 'work_item'], async (now, suspect) => {
				const undo = token('Start');
				const ctx = await context(now, suspect);
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
			transaction(['session'], async (now, suspect) => {
				const current = (await running()).at(-1);
				if (!current) return null;
				const undo = token('Stop');
				return { session: await stop(current, await context(now, suspect), undo), undo };
			}),
		switchTo: (opts) =>
			transaction(['session', 'work_item'], async (now, suspect) => {
				const undo = token('Switch');
				const ctx = await context(now, suspect);
				const current = (await running()).at(-1);
				const stopped = current ? await stop(current, ctx, undo) : null;
				const started = await start(opts.workItemId, ctx, undo);
				return { stopped, started, undo };
			}),
		editMany: (label, edits) =>
			transaction(
				edits.map((edit) => edit.entity),
				async (now) => {
					const undo = token(label);
					const ctx = await context(now);
					for (const edit of edits) {
						const before = await required(edit.entity, edit.id);
						await patch(edit.entity, before, edit.changes as Partial<AnyRecord>, ctx, undo);
					}
					return undo;
				},
			),
		applyPlan: (label, entity, plan) =>
			transaction([entity], async (now) => {
				const undo = token(label);
				const ctx = await context(now);
				for (const fields of plan.create) await create(entity, fields, ctx, undo);
				for (const edit of plan.update) {
					const before = (await required(entity, edit.id)) as RecordOf<typeof entity>;
					await patch(entity, before, edit.changes as Partial<RecordOf<typeof entity>>, ctx, undo);
				}
				for (const id of plan.remove) {
					await required(entity, id);
					await write(deleteMutation(entity, id, ctx), ctx, undo);
				}
				return undo;
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
