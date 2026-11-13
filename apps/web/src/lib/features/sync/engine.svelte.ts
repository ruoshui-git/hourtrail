import { liveQuery } from 'dexie';
import { SvelteSet } from 'svelte/reactivity';
import { readable } from 'svelte/store';
import {
	MAX_BATCH,
	newId,
	pushAckSchema,
	pullResponseSchema,
	replay,
	schemas,
} from '@hourtrail/core';
import type { Entity } from '@hourtrail/core';
import { ApiError, apiFetch, OfflineError } from '$lib/api/client';
import { auth } from '$lib/features/cloud/auth.svelte';
import { db } from '$lib/db/app';
import type { HourtrailDB, OutboxRow } from '$lib/db/schema';

export type SyncStatus = 'local' | 'synced' | 'pending' | 'offline' | 'error';
export type RejectedMutation = {
	mutation_id: string;
	entity: Entity;
	record_id: string;
	reason: string;
	at: number;
};
type SyncOptions = {
	db: HourtrailDB;
	isSignedIn: () => boolean;
	handleUnauthorized: () => void;
	request?: typeof apiFetch;
	clock?: () => number;
	id?: () => string;
};

const rejectedKey = 'sync_rejected';
const cursorKey = 'sync_cursor';
const clockOffsetKey = 'clock_offset_ms';
export class SyncEngine {
	status = $state<SyncStatus>('local');
	pendingCount = $state(0);
	lastSyncedAt = $state<number | null>(null);
	lastError = $state<string | null>(null);
	rejected = $state<RejectedMutation[]>([]);
	private readonly database: HourtrailDB;
	private readonly signedIn: () => boolean;
	private readonly unauthorized: () => void;
	private readonly request: typeof apiFetch;
	private readonly clock: () => number;
	private readonly id: () => string;
	private started = false;
	private inFlight = false;
	private followUp = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private interval: ReturnType<typeof setInterval> | undefined;
	private stopOutbox: (() => void) | undefined;
	private backoffMs = 2000;
	private lastCount = -1;

	constructor(options: SyncOptions) {
		this.database = options.db;
		this.signedIn = options.isSignedIn;
		this.unauthorized = options.handleUnauthorized;
		this.request = options.request ?? apiFetch;
		this.clock = options.clock ?? Date.now;
		this.id = options.id ?? newId;
	}

	start() {
		if (this.started || !this.signedIn()) return;
		this.started = true;
		this.status = 'pending';
		const outboxSubscription = liveQuery(() => this.database.outbox.count()).subscribe({
			next: (count) => {
				this.pendingCount = count;
				if (this.lastCount >= 0 && count > this.lastCount) this.schedule(1000);
				this.lastCount = count;
			},
			error: () => this.fail('Could not read the pending changes from this device.'),
		});
		this.stopOutbox = () => outboxSubscription.unsubscribe();
		if (typeof window !== 'undefined') {
			window.addEventListener('online', this.onOnline);
			document.addEventListener('visibilitychange', this.onVisibility);
			this.interval = setInterval(() => {
				if (document.visibilityState === 'visible') void this.syncNow();
			}, 60_000);
		}
		void this.initialize();
	}

	stop() {
		this.started = false;
		this.followUp = false;
		if (this.timer) clearTimeout(this.timer);
		if (this.interval) clearInterval(this.interval);
		this.timer = undefined;
		this.interval = undefined;
		this.stopOutbox?.();
		this.stopOutbox = undefined;
		if (typeof window !== 'undefined') {
			window.removeEventListener('online', this.onOnline);
			document.removeEventListener('visibilitychange', this.onVisibility);
		}
		this.status = 'local';
	}

	async syncNow(): Promise<void> {
		if (!this.started || !this.signedIn()) return;
		if (this.inFlight) {
			this.followUp = true;
			return;
		}
		this.inFlight = true;
		let retryDelay: number | undefined;
		try {
			await this.pushAll();
			await this.pullAll();
			this.pendingCount = await this.database.outbox.count();
			this.backoffMs = 2000;
			this.lastError = null;
			this.status = this.pendingCount > 0 ? 'pending' : 'synced';
			this.lastSyncedAt = this.clock();
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				this.unauthorized();
				this.stop();
				return;
			}
			if (error instanceof OfflineError) {
				this.status = 'offline';
				this.lastError = error.message;
			} else {
				this.fail(error instanceof Error ? error.message : 'Sync could not be completed.');
				retryDelay = this.backoffMs;
				this.backoffMs = Math.min(this.backoffMs * 2, 5 * 60_000);
			}
		} finally {
			this.inFlight = false;
			if (this.started && (this.followUp || retryDelay !== undefined)) {
				this.followUp = false;
				this.schedule(retryDelay ?? 0);
			}
		}
	}

	private async initialize() {
		try {
			const [pendingCount, rejected] = await Promise.all([
				this.database.outbox.count(),
				this.database.local.get(rejectedKey),
			]);
			if (!this.started) return;
			this.pendingCount = pendingCount;
			this.rejected = Array.isArray(rejected?.value)
				? (rejected.value as RejectedMutation[]).slice(-200)
				: [];
			await this.syncNow();
		} catch (error) {
			this.fail(error instanceof Error ? error.message : 'Sync could not be initialized.');
		}
	}

	private async saveClockOffset(serverTime: number, startedAt: number) {
		const midpoint = (startedAt + this.clock()) / 2;
		await this.database.local.put({ key: clockOffsetKey, value: serverTime - midpoint });
	}

	private async pushAll() {
		while (true) {
			const rows = await this.nextBatch();
			if (rows.length === 0) return;
			const batchId = rows[0]!.batch_id!;
			const deviceRow = await this.database.local.get('device_id');
			if (typeof deviceRow?.value !== 'string')
				throw new Error('This device has no sync identity.');
			const startedAt = this.clock();
			const ack = await this.request('/api/sync/push', {
				method: 'POST',
				body: {
					batch_id: batchId,
					device_id: deviceRow.value,
					mutations: rows.map((row) => row.mutation),
				},
				schema: pushAckSchema,
			});
			if (ack.batch_id !== batchId) throw new Error('Sync acknowledged a different batch.');
			await this.saveClockOffset(ack.server_time, startedAt);
			await this.database.transaction('rw', this.database.outbox, this.database.local, async () => {
				for (const row of rows) {
					const current = await this.database.outbox.get(row.seq);
					if (current?.batch_id === batchId) await this.database.outbox.delete(row.seq);
				}
				if (ack.rejected.length) {
					const previous = await this.database.local.get(rejectedKey);
					const rejected = Array.isArray(previous?.value)
						? (previous.value as RejectedMutation[])
						: [];
					const byId = Object.fromEntries(rejected.map((item) => [item.mutation_id, item]));
					for (const item of ack.rejected) {
						const mutation = rows.find((row) => row.mutation.id === item.mutation_id)?.mutation;
						if (mutation)
							byId[item.mutation_id] = {
								mutation_id: item.mutation_id,
								entity: mutation.entity,
								record_id: mutation.record_id,
								reason: item.reason,
								at: this.clock(),
							};
					}
					const newest = Object.values(byId).slice(-200);
					await this.database.local.put({ key: rejectedKey, value: newest });
					this.rejected = newest;
				}
			});
		}
	}

	private async nextBatch(): Promise<OutboxRow[]> {
		return this.database.transaction('rw', this.database.outbox, async () => {
			const rows = await this.database.outbox.orderBy('seq').toArray();
			const first = rows[0];
			if (!first) return [];
			if (first.batch_id !== null) return rows.filter((row) => row.batch_id === first.batch_id);
			const batch = [] as OutboxRow[];
			for (const row of rows) {
				if (row.batch_id !== null || batch.length >= MAX_BATCH) break;
				batch.push(row);
			}
			const batchId = this.id();
			for (const row of batch) {
				row.batch_id = batchId;
				await this.database.outbox.put(row);
			}
			return batch;
		});
	}

	private async pullAll() {
		while (true) {
			const stored = await this.database.local.get(cursorKey);
			const since = typeof stored?.value === 'number' ? stored.value : 0;
			const startedAt = this.clock();
			const page = await this.request(`/api/sync/pull?since=${since}&limit=500`, {
				schema: pullResponseSchema,
			});
			const parsed = page.records.map(({ entity, record }) => {
				try {
					return { entity, record: schemas[entity].parse(record) };
				} catch {
					throw new Error(`Sync received an invalid ${entity} record; the page was not applied.`);
				}
			});
			const entities = parsed
				.map((item) => item.entity)
				.filter((entity, index, all) => all.indexOf(entity) === index);
			await this.database.transaction(
				'rw',
				[
					...entities.map((entity) => this.database.entity(entity)),
					this.database.outbox,
					this.database.local,
				],
				async () => {
					// Read the outbox once per page: the transaction holds it, so it cannot change here.
					const pending = await this.database.outbox.orderBy('seq').toArray();
					for (const { entity, record } of parsed) {
						const mutations = pending
							.filter(
								(row) => row.mutation.entity === entity && row.mutation.record_id === record.id,
							)
							.map((row) => row.mutation);
						const value = mutations.length
							? replay(record, mutations, { now: this.clock() }).next
							: record;
						// Pulled server state bypasses repo by design: it must not create new outbox rows.
						if (value) await this.database.entity(entity).put(value);
						else await this.database.entity(entity).delete(record.id);
					}
					await this.database.local.put({ key: cursorKey, value: page.next_since });
				},
			);
			await this.saveClockOffset(page.server_time, startedAt);
			if (!page.more) return;
		}
	}

	private fail(message: string) {
		this.status = 'error';
		this.lastError = message;
	}

	private schedule(ms: number) {
		if (!this.started) return;
		if (this.inFlight) {
			this.followUp = true;
			return;
		}
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.syncNow();
		}, ms);
	}

	private onOnline = () => {
		this.backoffMs = 2000;
		void this.syncNow();
	};
	private onVisibility = () => {
		if (document.visibilityState === 'visible') void this.syncNow();
	};
}

export const sync = new SyncEngine({
	db,
	isSignedIn: () => auth.status === 'signed-in',
	handleUnauthorized: () => auth.handleUnauthorized(),
});

export const pendingRecordKeys = readable<ReadonlySet<string>>(new SvelteSet(), (set) => {
	const subscription = liveQuery(async () => {
		const rows = await db.outbox.toArray();
		return new SvelteSet(rows.map(({ mutation }) => `${mutation.entity}:${mutation.record_id}`));
	}).subscribe({ next: set });
	return () => subscription.unsubscribe();
});
