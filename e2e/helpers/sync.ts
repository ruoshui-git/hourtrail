import { expect, type Page } from '@playwright/test';
import { TEST_ACCOUNT_KEY } from './auth';

export async function signIn(page: Page, name: string) {
	await page.goto('/settings/cloud');
	await page.getByLabel('Account key').fill(TEST_ACCOUNT_KEY);
	await page.getByLabel('Device name').fill(name);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
}

export async function createSession(
	page: Page,
	input: { name: string; note?: string },
): Promise<string> {
	return page.evaluate(async ({ name, note }) => {
		const open = () =>
			new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		const local = (db: IDBDatabase) =>
			new Promise<string | undefined>((resolve, reject) => {
				const request = db.transaction('local').objectStore('local').get('device_id');
				request.onsuccess = () => resolve(request.result?.value as string | undefined);
				request.onerror = () => reject(request.error);
			});
		const uuid = (timestamp: number) => {
			const bytes = crypto.getRandomValues(new Uint8Array(16));
			let value = BigInt(timestamp);
			for (let index = 5; index >= 0; index--) {
				bytes[index] = Number(value & 0xffn);
				value >>= 8n;
			}
			bytes[6] = (bytes[6]! & 0x0f) | 0x70;
			bytes[8] = (bytes[8]! & 0x3f) | 0x80;
			const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
			return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
		};
		const db = await open();
		const deviceId = await local(db);
		if (!deviceId) throw new Error('Device identity is missing.');
		const now = Date.now();
		const itemId = uuid(now);
		const sessionId = uuid(now);
		const item = {
			id: itemId,
			name,
			description: '',
			type_id: '00000000-0000-7000-8000-000000000001',
			project_id: null,
			place_id: null,
			pinned_at: null,
			pin_sort: 0,
			archived_at: null,
			rev: 0,
			created_at: now,
			updated_at: now,
			updated_by: deviceId,
			deleted_at: null,
		};
		const session = {
			id: sessionId,
			work_item_id: itemId,
			type_id: item.type_id,
			start_at: now - 60_000,
			start_tz: 'America/New_York',
			end_at: now,
			end_tz: 'America/New_York',
			note: note ?? '',
			source: 'manual',
			place_id: null,
			place_state: 'none',
			place_candidates: [],
			flags: {},
			origin_device_id: deviceId,
			rev: 0,
			created_at: now,
			updated_at: now,
			updated_by: deviceId,
			deleted_at: null,
		};
		const transaction = db.transaction(['work_item', 'session', 'outbox'], 'readwrite');
		for (const [entity, record] of [
			['work_item', item],
			['session', session],
		] as [string, Record<string, unknown>][]) {
			transaction.objectStore(entity).put(record);
			transaction.objectStore('outbox').add({
				mutation: {
					id: uuid(now),
					entity,
					record_id: record.id,
					kind: 'put',
					value: record,
					at: now,
					device_id: deviceId,
				},
				batch_id: null,
				queued_at: now,
			});
		}
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
		db.close();
		return sessionId;
	}, input);
}

export async function localSyncState(page: Page) {
	return page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const read = <T>(store: string, mode: IDBTransactionMode = 'readonly') =>
			new Promise<T>((resolve, reject) => {
				const transaction = database.transaction(store, mode);
				const query = transaction.objectStore(store).getAll();
				query.onsuccess = () => resolve(query.result as T);
				query.onerror = () => reject(query.error);
			});
		const [outbox, sessions, conflicts] = await Promise.all([
			read<{ seq: number; batch_id: string | null }[]>('outbox'),
			read<{ id: string; note: string }[]>('session'),
			read<{ id: string; record_id: string; field: string }[]>('conflict'),
		]);
		database.close();
		return { outbox, sessions, conflicts };
	});
}

export async function editSession(page: Page, id: string, note: string) {
	await page.evaluate(
		async ({ id, note }) => {
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const deviceId = await new Promise<string | undefined>((resolve, reject) => {
				const request = db.transaction('local').objectStore('local').get('device_id');
				request.onsuccess = () => resolve(request.result?.value as string | undefined);
				request.onerror = () => reject(request.error);
			});
			if (!deviceId) throw new Error('Device identity is missing.');
			const session = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
				const request = db.transaction('session').objectStore('session').get(id);
				request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
				request.onerror = () => reject(request.error);
			});
			if (!session || typeof session.note !== 'string') throw new Error('Session is missing.');
			const now = Date.now();
			const from = session.note;
			const bytes = crypto.getRandomValues(new Uint8Array(16));
			let timestamp = BigInt(now);
			for (let index = 5; index >= 0; index--) {
				bytes[index] = Number(timestamp & 0xffn);
				timestamp >>= 8n;
			}
			bytes[6] = (bytes[6]! & 0x0f) | 0x70;
			bytes[8] = (bytes[8]! & 0x3f) | 0x80;
			const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
			const mutationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
			session.note = note;
			session.updated_at = now;
			session.updated_by = deviceId;
			const transaction = db.transaction(['session', 'outbox'], 'readwrite');
			transaction.objectStore('session').put(session);
			transaction.objectStore('outbox').add({
				mutation: {
					id: mutationId,
					entity: 'session',
					record_id: id,
					kind: 'patch',
					fields: { note: { from, to: note } },
					at: now,
					device_id: deviceId,
				},
				batch_id: null,
				queued_at: now,
			});
			await new Promise<void>((resolve, reject) => {
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
			});
			db.close();
		},
		{ id, note },
	);
}

export async function seedSessions(page: Page, suffix: string, count: number) {
	await page.evaluate(
		async ({ suffix, count }) => {
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const deviceId = await new Promise<string | undefined>((resolve, reject) => {
				const request = db.transaction('local').objectStore('local').get('device_id');
				request.onsuccess = () => resolve(request.result?.value as string | undefined);
				request.onerror = () => reject(request.error);
			});
			if (!deviceId) throw new Error('Device identity is missing.');
			const now = Date.now();
			const uuid = (timestamp: number) => {
				const bytes = crypto.getRandomValues(new Uint8Array(16));
				let value = BigInt(timestamp);
				for (let index = 5; index >= 0; index--) {
					bytes[index] = Number(value & 0xffn);
					value >>= 8n;
				}
				bytes[6] = (bytes[6]! & 0x0f) | 0x70;
				bytes[8] = (bytes[8]! & 0x3f) | 0x80;
				const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
				return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
			};
			const itemId = uuid(now);
			const item = {
				id: itemId,
				name: `First upload ${suffix}`,
				description: '',
				type_id: '00000000-0000-7000-8000-000000000001',
				project_id: null,
				place_id: null,
				pinned_at: null,
				pin_sort: 0,
				archived_at: null,
				rev: 0,
				created_at: now,
				updated_at: now,
				updated_by: deviceId,
				deleted_at: null,
			};
			const transaction = db.transaction(['work_item', 'session', 'outbox'], 'readwrite');
			const add = (entity: string, record: Record<string, unknown>, at: number) => {
				transaction.objectStore(entity).put(record);
				transaction.objectStore('outbox').add({
					mutation: {
						id: uuid(at),
						entity,
						record_id: record.id,
						kind: 'put',
						value: record,
						at,
						device_id: deviceId,
					},
					batch_id: null,
					queued_at: at,
				});
			};
			add('work_item', item, now);
			for (let index = 0; index < count; index++) {
				const at = now + index;
				const id = uuid(at);
				add(
					'session',
					{
						id,
						work_item_id: itemId,
						type_id: item.type_id,
						start_at: now - (index + 2) * 60_000,
						start_tz: 'America/New_York',
						end_at: now - (index + 2) * 60_000 + 30_000,
						end_tz: 'America/New_York',
						note: `Seeded ${suffix} session ${index}`,
						source: 'manual',
						place_id: null,
						place_state: 'none',
						place_candidates: [],
						flags: {},
						origin_device_id: deviceId,
						rev: 0,
						created_at: at,
						updated_at: at,
						updated_by: deviceId,
						deleted_at: null,
					},
					at,
				);
			}
			await new Promise<void>((resolve, reject) => {
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
			});
			db.close();
		},
		{ suffix, count },
	);
}

export async function deviceIdentityReady(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('hourtrail');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		if (!db.objectStoreNames.contains('local')) {
			db.close();
			return false;
		}
		const deviceId = await new Promise<string | undefined>((resolve, reject) => {
			const request = db.transaction('local').objectStore('local').get('device_id');
			request.onsuccess = () => resolve(request.result?.value as string | undefined);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return Boolean(deviceId);
	});
}
