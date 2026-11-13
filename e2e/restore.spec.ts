import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildBackup, ENTITIES, newId, sessionFixId } from '../packages/core/src/index';
import type { BackupFile, Batch } from '../packages/core/src/index';
import { acquireCloud, releaseCloud } from './helpers/auth';
import {
	createSession,
	deviceIdentityReady,
	editSession,
	localSyncState,
	signIn,
} from './helpers/sync';

test.use({ actionTimeout: 15_000 });

type Row = Record<string, unknown>;
async function snapshot(page: Page): Promise<Record<string, Row[]>> {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('hourtrail');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			const names = [...db.objectStoreNames];
			const tx = db.transaction(names);
			return Object.fromEntries(
				await Promise.all(
					names.map(async (name) => [
						name,
						await new Promise<Row[]>((resolve, reject) => {
							const request = tx.objectStore(name).getAll();
							request.onsuccess = () => resolve(request.result);
							request.onerror = () => reject(request.error);
						}),
					]),
				),
			);
		} finally {
			db.close();
		}
	});
}
async function write(page: Page, input: { clear?: string[]; rows?: Record<string, Row[]> }) {
	await page.evaluate(async ({ clear = [], rows = {} }) => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('hourtrail');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			const tx = db.transaction([...new Set([...clear, ...Object.keys(rows)])], 'readwrite');
			for (const name of clear) tx.objectStore(name).clear();
			for (const [name, records] of Object.entries(rows))
				for (const row of records) tx.objectStore(name).put(row);
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	}, input);
}
async function open(page: Page, seeded = false) {
	const hint = page.getByRole('dialog', { name: 'Add Hourtrail to your Home Screen' });
	await page.addLocatorHandler(hint, async () => {
		await hint.getByRole('button', { name: 'Not now' }).click();
	});
	if (seeded) {
		await page.clock.setFixedTime(new Date('2026-11-12T15:30:00Z'));
		await page.goto('/dev/seed?scenario=idle');
		await expect(page.locator('[data-seed-status]')).toHaveText('Seeded idle');
	}
	await page.goto('/settings/backup');
	await expect(
		page.getByRole('button', { name: 'Restore from a backup file', exact: true }),
	).toBeEnabled();
	await expect.poll(() => deviceIdentityReady(page)).toBe(true);
	// Wait for all first-run writes before a fixture or navigation.
	await expect.poll(async () => (await snapshot(page)).setting?.length ?? 0).toBeGreaterThan(0);
}
function fileOf(state: Record<string, Row[]>): BackupFile {
	return buildBackup({
		records: Object.fromEntries(
			ENTITIES.map((entity) => [entity, state[entity]]),
		) as BackupFile['records'],
		localFixes: state.local_fix as BackupFile['local_fixes'],
		exportedAt: Date.parse('2026-11-12T15:30:00Z'),
		device: { id: 'backup-device', name: 'Phone' },
	});
}
async function seededBackup(page: Page) {
	await open(page, true);
	const state = await snapshot(page);
	const session = state.session![0]!;
	const tombstone = {
		...state.work_item![0]!,
		id: newId(),
		name: '修复洗手台',
		deleted_at: Date.parse('2026-11-11T15:00:00Z'),
	};
	const fix = {
		id: sessionFixId(session.id as string, 'start'),
		session_id: session.id,
		kind: 'start',
		lat: 44.65,
		lng: -63.57,
		accuracy_m: 12,
		captured_at: session.start_at,
	};
	const place = {
		id: newId(),
		rev: 0,
		created_at: session.created_at,
		updated_at: session.updated_at,
		updated_by: session.updated_by,
		deleted_at: null,
		name: '第1寺院',
		lat: 44.65,
		lng: -63.57,
		radius_m: 100,
		description: '修复洗手台',
		archived_at: null,
	};
	await write(page, {
		rows: {
			work_item: [tombstone, { ...state.work_item![0]!, place_id: place.id }],
			session: [{ ...session, place_id: place.id, place_state: 'set' }],
			place: [place],
			local_fix: [fix],
		},
	});
	const expected = await snapshot(page);
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download backup', exact: true }).click();
	const download = await downloading;
	const bytes = await readFile((await download.path())!);
	await expect
		.poll(async () => (await snapshot(page)).local!.some((row) => row.key === 'last_backup_at'))
		.toBe(true);
	return { file: JSON.parse(bytes.toString()) as BackupFile, bytes, expected };
}
async function choose(page: Page, file: BackupFile | Buffer | Row) {
	await page.getByLabel('Backup file', { exact: true }).setInputFiles({
		name: 'hourtrail-backup.json',
		mimeType: 'application/json',
		buffer: Buffer.isBuffer(file) ? file : Buffer.from(JSON.stringify(file)),
	});
}
function comparable(rows: Row[]) {
	return rows
		.map(({ rev: _rev, deleted_at, ...row }) => ({ ...row, deleted_at: deleted_at !== null }))
		.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
async function replaced(page: Page) {
	await expect(
		page.getByText('This device now matches the backup from Nov 12.', { exact: true }),
	).toBeVisible();
	await expect
		.poll(async () => (await snapshot(page)).local!.some((row) => row.key === 'last_restore'))
		.toBe(true);
}
async function confirmReplace(page: Page) {
	await page.getByRole('radio', { name: 'Replace everything', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Restore from a backup file' });
	const button = sheet.getByRole('button', { name: 'Replace everything', exact: true });
	await expect(button).toBeDisabled();
	await expect(sheet.getByLabel('Type replace to confirm')).toBeDisabled();
	const downloading = page.waitForEvent('download');
	await sheet.getByRole('button', { name: 'Save a backup of this device' }).click();
	await downloading;
	await expect(sheet.getByText('Backup saved.', { exact: true })).toBeVisible();
	await expect(button).toBeDisabled();
	await sheet.getByLabel('Type replace to confirm').fill('Replace');
	await expect(button).toBeDisabled();
	await sheet.getByLabel('Type replace to confirm').fill('replace');
	await expect(button).toBeEnabled();
	return button;
}

test('scenario L: a downloaded Unicode backup recovers every synced store and raw fix in a clean context', async ({
	page,
	browser,
	baseURL,
}) => {
	const { file, bytes, expected } = await seededBackup(page);
	expect(bytes.includes(Buffer.from('库存管理系统开发'))).toBe(true);
	expect(bytes.includes(Buffer.from('第1寺院'))).toBe(true);
	expect(
		file.records.session.some(
			(s) =>
				s.start_at < Date.parse('2026-11-12T05:00:00Z') &&
				s.end_at! > Date.parse('2026-11-12T05:00:00Z'),
		),
	).toBe(true);
	const clean = await browser.newContext({
		baseURL,
		timezoneId: 'America/New_York',
		locale: 'en-US',
	});
	try {
		const target = await clean.newPage();
		await open(target);
		// Empty synced stores after setup to exercise absent ids, including the fixed defaults.
		await write(target, { clear: [...ENTITIES, 'local_fix', 'outbox'] });
		await choose(target, bytes);
		await expect(target.getByText(/^5 sessions, 5 work items, 1 place,/)).toBeVisible();
		await expect(
			target.getByRole('radio', { name: "Add what's missing", exact: true }),
		).toBeChecked();
		const total = Object.values(file.counts).reduce((a, b) => a + b, 0);
		await target.getByRole('button', { name: "Add what's missing", exact: true }).click();
		await expect(
			target.getByText(`Added ${total} records. 0 were already here.`, { exact: true }),
		).toBeVisible();
		await expect
			.poll(async () => (await snapshot(target)).local!.some((row) => row.key === 'last_restore'))
			.toBe(true);
		const actual = await snapshot(target);
		for (const entity of ENTITIES)
			expect(comparable(actual[entity]!)).toEqual(comparable(expected[entity]!));
		expect(actual.local_fix).toEqual(expected.local_fix);
		expect(actual.outbox!.every((row) => row.mode === undefined)).toBe(true);
	} finally {
		await clean.close();
	}
});

test('Add what is missing preserves existing records and fixes, adds only absent ids, and is idempotent', async ({
	page,
}) => {
	const { file } = await seededBackup(page);
	const existing = {
		...file.records.work_item[0]!,
		name: 'Already edited here',
		deleted_at: Date.now(),
	};
	const existingFix = { ...file.local_fixes[0]!, lat: 45 };
	const absent = file.records.session[0]!;
	await write(page, {
		clear: ['session'],
		rows: { work_item: [existing], local_fix: [existingFix] },
	});
	const before = await snapshot(page);
	await choose(page, file);
	await page.getByRole('button', { name: "Add what's missing", exact: true }).click();
	await expect(page.getByText(/^Added /)).toBeVisible();
	await expect
		.poll(async () => (await snapshot(page)).session!.length)
		.toBe(file.records.session.length);
	const after = await snapshot(page);
	for (const entity of [...ENTITIES.filter((entity) => entity !== 'session'), 'local_fix'])
		expect(after[entity]).toEqual(before[entity]);
	expect(after.session!.find((row) => row.id === absent.id)).toEqual(absent);
	await choose(page, file);
	await page.getByRole('button', { name: "Add what's missing", exact: true }).click();
	await expect(page.getByText(/^Added 0 records\./)).toBeVisible();
	expect((await snapshot(page)).outbox).toEqual(after.outbox);
});

test('Replace everything requires a backup saved in this sheet and exact typed confirmation, and removes extras', async ({
	page,
}) => {
	const { file } = await seededBackup(page);
	const extra = { ...file.records.project[0]!, id: newId(), name: 'Extra' };
	const extraFix = {
		...file.local_fixes[0]!,
		id: sessionFixId(file.records.session[0]!.id, 'end'),
		kind: 'end',
	};
	await write(page, { rows: { project: [extra], local_fix: [extraFix] } });
	await choose(page, file);
	await confirmReplace(page);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Restore from a backup file' })).toHaveCount(0);
	await choose(page, file);
	await page.getByRole('radio', { name: 'Replace everything', exact: true }).click();
	await expect(page.getByLabel('Type replace to confirm')).toBeDisabled();
	const before = await snapshot(page);
	expect(before.project!.find((row) => row.id === extra.id)!.deleted_at).toBeNull();
	const button = await confirmReplace(page);
	await button.click();
	await replaced(page);
	const actual = await snapshot(page);
	for (const entity of ENTITIES)
		expect(comparable(actual[entity]!.filter((row) => row.id !== extra.id))).toEqual(
			comparable(file.records[entity]),
		);
	expect(actual.project!.find((row) => row.id === extra.id)!.deleted_at).not.toBeNull();
	expect(actual.local_fix).toEqual(file.local_fixes);
});

test('invalid JSON, non-Hourtrail JSON, and a newer version write nothing', async ({ page }) => {
	await open(page);
	const before = await snapshot(page);
	for (const file of [Buffer.from('{'), { data: [] }, { format: 'hourtrail-backup', version: 2 }]) {
		await choose(page, file);
		await expect(page.getByRole('alert')).toHaveText(
			!Buffer.isBuffer(file) && 'version' in file
				? 'This backup was made by a newer version of Hourtrail. Update the app, then try again.'
				: "This isn't a Hourtrail backup file.",
		);
		expect(await snapshot(page)).toEqual(before);
	}
});

test('restores 3,000 sessions with progress in under 30 seconds', async ({ page }, testInfo) => {
	await open(page, true);
	const file = fileOf(await snapshot(page));
	file.records.session = Array.from({ length: 3000 }, (_, index) => ({
		...file.records.session[0]!,
		id: newId(),
		note: `库存管理系统开发 ${index}`,
	}));
	const backup = buildBackup({
		records: file.records,
		localFixes: file.local_fixes,
		exportedAt: file.exported_at,
		device: file.device,
	});
	await choose(page, backup);
	const progress: string[] = [];
	await page.exposeFunction('restoreProgress', (value: string) => progress.push(value));
	await page.evaluate(() => {
		new MutationObserver(() => {
			const status = [...document.querySelectorAll('[role=status]')]
				.map((el) => el.textContent ?? '')
				.find((text) => text.startsWith('Restoring…'));
			if (status)
				void (
					window as unknown as { restoreProgress: (text: string) => Promise<void> }
				).restoreProgress(status);
		}).observe(document.body, { childList: true, subtree: true, characterData: true });
	});
	const started = Date.now();
	await page.getByRole('button', { name: "Add what's missing", exact: true }).click();
	await expect(page.getByText(/^Added 3,000 records\./)).toBeVisible({ timeout: 30_000 });
	await expect.poll(async () => (await snapshot(page)).session!.length).toBe(3005);
	const elapsed = Date.now() - started;
	expect(elapsed).toBeLessThan(30_000);
	expect(progress.some((value) => /Restoring… [1-9]/.test(value))).toBe(true);
	testInfo.annotations.push({
		type: 'restore-time',
		description: `${elapsed} ms for 3,000 sessions`,
	});
	console.log(`Restore (${testInfo.project.name}): ${elapsed} ms for 3,000 sessions.`);
});

test('signed-in replacement overwrites both deletion states, tombstones B extras, and pushes no rejected or mixed-mode batch', async ({
	browser,
	browserName,
	baseURL,
}) => {
	test.setTimeout(180_000);
	test.skip(
		browserName !== 'chromium',
		'Cloud sync requires Chromium Secure-cookie support on loopback HTTP.',
	);
	await acquireCloud();
	const contextA = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const contextB = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	try {
		await signIn(a, 'Restore A');
		const liveId = await createSession(a, { name: '库存管理系统开发', note: '第1寺院' });
		const deadId = await createSession(a, { name: '修复洗手台', note: 'Backup tombstone' });
		await a.reload();
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBe(0);
		await signIn(b, 'Restore B');
		await expect.poll(async () => (await localSyncState(b)).sessions.length).toBe(2);
		const file = fileOf(await snapshot(a));
		file.records.session.find((row) => row.id === deadId)!.deleted_at = Date.now() - 60_000;
		// The cloud holds a tombstone where the backup is live, and a live row where it is deleted.
		await a.goto('/settings/backup');
		const state = await snapshot(a);
		const device = state.local!.find((row) => row.key === 'device_id')!.value;
		await write(a, {
			rows: {
				session: [{ ...state.session!.find((row) => row.id === liveId)!, deleted_at: Date.now() }],
				outbox: [
					{
						mutation: {
							id: newId(),
							entity: 'session',
							record_id: liveId,
							kind: 'delete',
							at: Date.now(),
							device_id: device,
						},
						queued_at: Date.now(),
						batch_id: null,
					},
				],
			},
		});
		await a.reload();
		await expect.poll(async () => (await localSyncState(a)).outbox.length).toBe(0);
		await editSession(b, deadId, 'Edited on B after backup');
		const extraId = await createSession(b, { name: 'Extra from B' });
		await b.reload();
		await expect.poll(async () => (await localSyncState(b)).outbox.length).toBe(0);
		await a.reload();
		await expect.poll(async () => (await localSyncState(a)).sessions.length).toBe(3);
		await a.goto('/settings/backup');
		await expect(
			a.getByRole('button', { name: 'Restore from a backup file', exact: true }),
		).toBeEnabled();
		const sent: Batch[] = [];
		const rejected: unknown[] = [];
		await a.route('**/api/sync/push', async (route) => {
			const body = route.request().postDataJSON() as Batch;
			sent.push(body);
			const response = await route.fetch();
			rejected.push(...((await response.json()) as { rejected: unknown[] }).rejected);
			await route.fulfill({ response });
		});
		await choose(
			a,
			buildBackup({
				records: file.records,
				localFixes: file.local_fixes,
				exportedAt: file.exported_at,
				device: file.device,
			}),
		);
		const button = await confirmReplace(a);
		await button.click();
		await replaced(a);
		await expect
			.poll(async () => (await localSyncState(a)).outbox.length, { timeout: 90_000 })
			.toBe(0);
		expect(rejected).toEqual([]);
		expect(sent.some((batch) => batch.mode === 'restore')).toBe(true);
		for (const batch of sent)
			for (const mutation of batch.mutations) {
				if (batch.mode === 'restore') {
					expect(mutation.kind).toBe('put');
					expect(mutation.value!.deleted_at).toBeNull();
				} else expect(['undelete', 'delete']).toContain(mutation.kind);
			}
		const mutations = sent.flatMap((batch) => batch.mutations);
		for (const entity of ENTITIES)
			for (const record of file.records[entity]) {
				const steps = mutations.filter((m) => m.entity === entity && m.record_id === record.id);
				expect(steps.map((m) => m.kind)).toEqual([
					'undelete',
					'put',
					...(record.deleted_at === null ? [] : ['delete']),
				]);
			}
		await b.reload();
		await expect
			.poll(async () => {
				const row = (await snapshot(b)).session!.find((row) => row.id === extraId);
				return row !== undefined && row.deleted_at !== null;
			})
			.toBe(true);
		const restored = await snapshot(b);
		for (const entity of ENTITIES) {
			const expected = file.records[entity];
			const rows = restored[entity]!;
			for (const record of expected) {
				const row = rows.find((row) => row.id === record.id)!;
				const { rev: _rev, updated_at: _at, updated_by: _by, deleted_at, ...fields } = record;
				expect(row).toMatchObject(fields);
				expect(row.deleted_at !== null).toBe(deleted_at !== null);
			}
			expect(
				rows
					.filter((row) => row.deleted_at === null)
					.map((row) => row.id)
					.sort(),
			).toEqual(
				expected
					.filter((row) => row.deleted_at === null)
					.map((row) => row.id)
					.sort(),
			);
		}
		expect(restored.local!.find((row) => row.key === 'sync_rejected')?.value ?? []).toEqual([]);
	} finally {
		await contextA.close();
		await contextB.close();
		releaseCloud();
	}
});

for (const theme of ['light', 'dark'] as const) {
	test(`restore screenshots in ${theme}`, async ({ page }, testInfo) => {
		test.setTimeout(60_000);
		await page.setViewportSize(
			testInfo.project.name === 'chromium'
				? { width: 1280, height: 800 }
				: { width: 390, height: 844 },
		);
		await page.emulateMedia({ colorScheme: theme });
		const { file } = await seededBackup(page);
		const directory = join(process.env.HT_RUN_DIR ?? testInfo.outputDir, 'shots');
		await mkdir(directory, { recursive: true });
		const shot = async (state: string) => {
			await page.mouse.move(0, 0);
			await expect(page.getByRole('group').filter({ hasText: 'Backup saved.' })).toHaveCount(0, {
				timeout: 10_000,
			});
			await page.evaluate(() => document.fonts.ready);
			await expect(page.locator('body')).toHaveJSProperty(
				'scrollWidth',
				await page.evaluate(() => innerWidth),
			);
			await page.screenshot({
				path: join(directory, `restore-${state}-${testInfo.project.name}-${theme}.png`),
				animations: 'disabled',
				scale: 'css',
			});
		};
		await choose(page, file);
		await expect(page.getByText(/^Backup from Thu, Nov 12, 2026/)).toBeVisible();
		await shot('summary');
		const button = await confirmReplace(page);
		await shot('replace');
		await button.click();
		await replaced(page);
		await shot('result');
		await choose(page, { format: 'other' });
		await expect(page.getByRole('alert')).toHaveText("This isn't a Hourtrail backup file.");
		await shot('invalid');
		// Hold a real IndexedDB restore transaction so its progress can be captured reliably.
		await choose(page, file);
		await page.evaluate(() => {
			const request = indexedDB.open('hourtrail');
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction('session', 'readwrite');
				const until = performance.now() + 3000;
				const keepAlive = () => {
					const read = tx.objectStore('session').getAll();
					read.onsuccess = () => {
						if (performance.now() < until) keepAlive();
					};
				};
				keepAlive();
				tx.oncomplete = () => db.close();
			};
		});
		await page.getByRole('button', { name: "Add what's missing", exact: true }).click();
		await expect(page.getByText(/^Restoring…/)).toBeVisible();
		await shot('progress');
		await expect(page.getByText(/^Added 0 records\./)).toBeVisible();
	});
}
