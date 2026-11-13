import { expect, type Page } from '@playwright/test';
import { newId, reviewMarkId } from '../../packages/core/src/index';

export type ScenarioRow = Record<string, unknown>;
export type ScenarioSnapshot = Record<string, ScenarioRow[]>;

export async function seedRecords(page: Page, records: Record<string, ScenarioRow[]>) {
	await page.evaluate(async (input) => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const deviceRequest = db.transaction('local').objectStore('local').get('device_id');
		const deviceId = await new Promise<string>((resolve, reject) => {
			deviceRequest.onsuccess = () => resolve(deviceRequest.result.value as string);
			deviceRequest.onerror = () => reject(deviceRequest.error);
		});
		const bytesUuid = (at: number) => {
			const bytes = crypto.getRandomValues(new Uint8Array(16));
			let value = BigInt(at);
			for (let i = 5; i >= 0; i--) {
				bytes[i] = Number(value & 0xffn);
				value >>= 8n;
			}
			bytes[6] = (bytes[6]! & 15) | 112;
			bytes[8] = (bytes[8]! & 63) | 128;
			const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
			return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
		};
		const now = Date.now();
		const rows = Object.entries(input).flatMap(([entity, records]) =>
			records.map((record) => ({ entity, record })),
		);
		const tx = db.transaction(
			[...new Set([...rows.map(({ entity }) => entity), 'outbox'])],
			'readwrite',
		);
		for (const { entity, record } of rows) {
			const value = { ...record, updated_by: deviceId };
			tx.objectStore(entity).put(value);
			tx.objectStore('outbox').add({
				mutation: {
					id: bytesUuid(now),
					entity,
					record_id: value.id,
					kind: 'put',
					value,
					at: now,
					device_id: deviceId,
				},
				batch_id: null,
				queued_at: now,
			});
		}
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
		db.close();
	}, records);
}

export async function patchScenarioRecord(
	page: Page,
	entity: string,
	id: string,
	changes: Record<string, unknown>,
) {
	await page.evaluate(
		async ({ entity, id, changes }) => {
			const request = indexedDB.open('hourtrail');
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const deviceRequest = db.transaction('local').objectStore('local').get('device_id');
			const deviceId = await new Promise<string>((resolve, reject) => {
				deviceRequest.onsuccess = () => resolve(deviceRequest.result.value as string);
				deviceRequest.onerror = () => reject(deviceRequest.error);
			});
			const getRequest = db.transaction(entity).objectStore(entity).get(id);
			const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
				getRequest.onsuccess = () => resolve(getRequest.result);
				getRequest.onerror = () => reject(getRequest.error);
			});
			if (!record) throw new Error(`Missing ${entity} ${id}`);
			const now = Date.now();
			const fields = Object.fromEntries(
				Object.entries(changes).map(([key, to]) => [key, { from: record[key], to }]),
			);
			const updated = { ...record, ...changes, updated_at: now, updated_by: deviceId };
			const uuid = () => {
				const bytes = crypto.getRandomValues(new Uint8Array(16));
				let value = BigInt(now);
				for (let i = 5; i >= 0; i--) {
					bytes[i] = Number(value & 255n);
					value >>= 8n;
				}
				bytes[6] = (bytes[6]! & 15) | 112;
				bytes[8] = (bytes[8]! & 63) | 128;
				const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
				return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
			};
			const tx = db.transaction([entity, 'outbox'], 'readwrite');
			tx.objectStore(entity).put(updated);
			tx.objectStore('outbox').add({
				mutation: {
					id: uuid(),
					entity,
					record_id: id,
					kind: 'patch',
					fields,
					at: now,
					device_id: deviceId,
				},
				batch_id: null,
				queued_at: now,
			});
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
			db.close();
		},
		{ entity, id, changes },
	);
}

export function unicodeDataset(suffix: string) {
	const now = Date.now();
	const common = () => ({
		id: newId(),
		rev: 0,
		created_at: now,
		updated_at: now,
		updated_by: '',
		deleted_at: null,
	});
	const value = `库存管理系统开发 第1寺院 修复洗手台 🚲 e\u0301 ${suffix}`;
	const project = { ...common(), name: `${value} project`, archived_at: null };
	const place = {
		...common(),
		name: `${value} place`,
		lat: 44.65,
		lng: -63.57,
		radius_m: 100,
		description: value,
		archived_at: null,
	};
	const work = {
		...common(),
		name: `${value} work`,
		description: value,
		type_id: '00000000-0000-7000-8000-000000000001',
		project_id: project.id,
		place_id: place.id,
		pinned_at: null,
		pin_sort: 0,
		archived_at: null,
	};
	const session = {
		...common(),
		work_item_id: work.id,
		type_id: work.type_id,
		start_at: now - 60_000,
		end_at: now,
		start_tz: 'America/New_York',
		end_tz: 'America/New_York',
		note: value,
		source: 'manual',
		place_id: place.id,
		place_state: 'set',
		place_candidates: [],
		origin_device_id: 'unicode-seed',
		flags: {},
	};
	return {
		values: {
			project: project.name,
			place: place.name,
			work_item: work.name,
			note: session.note,
			description: place.description,
		},
		ids: { project: project.id, place: place.id, work_item: work.id, session: session.id },
		records: { project: [project], place: [place], work_item: [work], session: [session] },
	};
}

export function unicodeCodePoints(value: string) {
	return [...value].map((character) => character.codePointAt(0));
}

export function recoveryDataset(suffix: string) {
	const now = Date.now();
	const common = () => ({
		id: newId(),
		rev: 0,
		created_at: now,
		updated_at: now,
		updated_by: '',
		deleted_at: null as number | null,
	});
	const projectA = { ...common(), name: `Recovery project ${suffix}`, archived_at: null };
	const projectB = { ...common(), name: `Other project ${suffix}`, archived_at: null };
	const place = {
		...common(),
		name: `Recovery place ${suffix}`,
		lat: 44.65,
		lng: -63.57,
		radius_m: 100,
		description: 'Named recovery location',
		archived_at: null,
	};
	const work = {
		...common(),
		name: `Work ${suffix}`,
		description: 'Work type item',
		type_id: '00000000-0000-7000-8000-000000000001',
		project_id: projectA.id,
		place_id: place.id,
		pinned_at: null,
		pin_sort: 0,
		archived_at: null,
	};
	const overhead = {
		...common(),
		name: `Overhead ${suffix}`,
		description: '',
		type_id: '00000000-0000-7000-8000-000000000002',
		project_id: projectB.id,
		place_id: place.id,
		pinned_at: null,
		pin_sort: 0,
		archived_at: null,
	};
	const volunteer = {
		...common(),
		name: `Volunteer ${suffix}`,
		description: '',
		type_id: '00000000-0000-7000-8000-000000000003',
		project_id: projectA.id,
		place_id: null,
		pinned_at: null,
		pin_sort: 0,
		archived_at: null,
	};
	const start = Date.parse('2026-11-12T04:30:00Z');
	const session = (item: typeof work, begin: number, end: number, note: string) => ({
		...common(),
		work_item_id: item.id,
		type_id: item.type_id,
		start_at: begin,
		end_at: end,
		start_tz: 'America/New_York',
		end_tz: 'America/New_York',
		note,
		source: 'manual',
		place_id: place.id,
		place_state: 'set',
		place_candidates: [],
		origin_device_id: 'seeded-device',
		flags: {},
	});
	const crossing = session(work, start, start + 2 * 60 * 60_000, `Midnight crossing ${suffix}`);
	const ended = session(
		overhead,
		start + 4 * 60 * 60_000,
		start + 5 * 60 * 60_000,
		`Overhead note ${suffix}`,
	);
	const tombstone = {
		...session(
			volunteer,
			start + 6 * 60 * 60_000,
			start + 7 * 60 * 60_000,
			`Tombstone note ${suffix}`,
		),
		deleted_at: now - 1000,
	};
	const markDay = '2026-11-12';
	const markKey = `seeded-review-${suffix}`;
	const reviewMark = {
		...common(),
		id: reviewMarkId(markDay, markKey),
		day: markDay,
		issue_key: markKey,
		state: 'reviewed',
	};
	const dayReview = { ...common(), id: markDay, finished_at: now - 500 };
	const preset = { ...common(), name: `Recovery preset ${suffix}`, config: {} };
	const fix = {
		...common(),
		id: `${crossing.id}:start`,
		session_id: crossing.id,
		kind: 'start',
		lat: 44.65,
		lng: -63.57,
		accuracy_m: 9,
		captured_at: start,
	};
	return {
		project: [projectA, projectB],
		place: [place],
		work_item: [work, overhead, volunteer],
		session: [crossing, ended, tombstone],
		session_fix: [fix],
		review_mark: [reviewMark],
		day_review: [dayReview],
		report_preset: [preset],
	};
}

export async function scenarioSnapshot(page: Page): Promise<ScenarioSnapshot> {
	return page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			const names = [...db.objectStoreNames];
			const tx = db.transaction(names, 'readonly');
			return Object.fromEntries(
				await Promise.all(
					names.map(
						(name) =>
							new Promise<[string, ScenarioRow[]]>((resolve, reject) => {
								const query = tx.objectStore(name).getAll();
								query.onsuccess = () => resolve([name, query.result as ScenarioRow[]]);
								query.onerror = () => reject(query.error);
							}),
					),
				),
			);
		} finally {
			db.close();
		}
	});
}

export async function waitForOutbox(page: Page, count = 0) {
	await expect.poll(async () => (await scenarioSnapshot(page)).outbox?.length ?? -1).toBe(count);
}

export async function clearSyncedStores(page: Page) {
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			const names = [...db.objectStoreNames].filter((name) => name !== 'local');
			const tx = db.transaction(names, 'readwrite');
			for (const name of names) tx.objectStore(name).clear();
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	});
}

export function syncedRows(snapshot: ScenarioSnapshot, store: string) {
	return (snapshot[store] ?? [])
		.map(({ rev: _rev, deleted_at, ...row }) => ({ ...row, deleted_at: deleted_at !== null }))
		.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
