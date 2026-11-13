import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { dismissInstallHint, readRecords, seed } from './helpers/acceptance';

const shots = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : undefined;

async function installAppearance(page: Page, mode: 'Light' | 'Dark') {
	await page.goto('/settings/appearance');
	await dismissInstallHint(page);
	await page.getByRole('radio', { name: mode }).click();
}

async function setTimes(page: Page, id: string, start: number, end: number, clone = false) {
	await page.evaluate(
		({ id, start, end, clone }) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction('session', 'readwrite');
					const store = tx.objectStore('session');
					const get = store.get(id);
					get.onerror = () => reject(get.error);
					get.onsuccess = () => {
						const source = get.result;
						store.put({
							...source,
							start_at: start,
							end_at: end,
							start_tz: 'America/New_York',
							end_tz: 'America/New_York',
						});
						if (clone)
							store.add({
								...source,
								id: crypto.randomUUID(),
								rev: 0,
								created_at: Date.now(),
								updated_at: Date.now(),
								start_at: end + 45 * 60_000,
								end_at: end + 105 * 60_000,
								start_tz: 'America/New_York',
								end_tz: 'America/New_York',
								note: 'Gap part',
							});
					};
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onerror = () => reject(tx.error);
				};
			}),
		{ id, start, end, clone },
	);
}

test('split and undo; merge compatible neighbors with gap confirmation and undo', async ({
	page,
}, info) => {
	await page.clock.setFixedTime(new Date('2026-11-12T10:30:00-05:00'));
	await seed(page, 'idle');
	await installAppearance(page, info.project.name === 'webkit-iphone' ? 'Light' : 'Dark');
	let records = await readRecords(page);
	const firstItem = records.work_item.find((item) => item.name === '库存管理系统开发')!;
	const base = records.session.find((item) => item.work_item_id === firstItem.id)!;
	const day = new Date('2026-11-11T09:00:00-05:00').getTime();
	await setTimes(page, base.id, day, day + 60 * 60_000);
	await page.goto(`/dev/editor?id=${base.id}`);
	await expect(page.getByRole('button', { name: 'Split' })).toBeVisible();
	await page.getByRole('button', { name: 'Split', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Split session' })).toBeVisible();
	if (shots && info.project.name === 'webkit-iphone') {
		await mkdir(shots, { recursive: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await page
			.locator('.sheet')
			.last()
			.locator('.body')
			.evaluate((element) => (element.scrollTop = element.scrollHeight));
		await page.screenshot({ path: join(shots, 'session-split-phone-light.png'), scale: 'css' });
	}
	await page.getByRole('button', { name: 'Split session' }).click();
	await expect(page.getByText('Session split', { exact: true })).toBeVisible();
	records = await readRecords(page);
	expect(
		records.session.filter((item) => item.work_item_id === firstItem.id && item.deleted_at === null)
			.length,
	).toBeGreaterThan(1);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect(
		(await readRecords(page)).session.filter(
			(item) => item.work_item_id === firstItem.id && item.deleted_at === null,
		),
	).toHaveLength(1);

	await setTimes(page, base.id, day, day + 60 * 60_000, true);
	await page.goto(`/dev/editor?id=${base.id}`);
	const mergeAction = page.getByRole('button', { name: /Merge with the/ });
	await expect(mergeAction).toBeVisible();
	await mergeAction.click();
	await expect(page.getByText(/including 45m not recorded/)).toBeVisible();
	if (shots && info.project.name === 'chromium') {
		await mkdir(shots, { recursive: true });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.waitForTimeout(500);
		await page.screenshot({ path: join(shots, 'session-merge-confirm-desktop-dark.png') });
	}
	await page.getByRole('button', { name: 'Merge sessions' }).click();
	await expect(page.getByText('Sessions merged', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	expect(
		(await readRecords(page)).session.filter(
			(item) => item.work_item_id === firstItem.id && item.deleted_at === null,
		),
	).toHaveLength(2);
});

test('does not offer an incompatible merge or split for a running session', async ({ page }) => {
	await seed(page, 'idle');
	const idleRecords = await readRecords(page);
	const inventory = idleRecords.work_item.find((item) => item.name === '库存管理系统开发')!;
	const maintenance = idleRecords.work_item.find((item) => item.name === 'Building Maintenance')!;
	const inventorySession = idleRecords.session.find((item) => item.work_item_id === inventory.id)!;
	const maintenanceSession = idleRecords.session.find(
		(item) => item.work_item_id === maintenance.id,
	)!;
	const base = new Date('2026-11-11T09:00:00-05:00').getTime();
	await setTimes(page, inventorySession.id, base, base + 60 * 60_000);
	await setTimes(page, maintenanceSession.id, base + 60 * 60_000, base + 2 * 60 * 60_000);
	await page.goto(`/dev/editor?id=${inventorySession.id}`);
	await expect(page.getByRole('button', { name: /Merge with the/ })).toHaveCount(0);

	await seed(page, 'running');
	const records = await readRecords(page);
	const running = records.session.find((item) => item.end_at === null)!;
	await page.goto(`/dev/editor?id=${running.id}`);
	await expect(page.getByRole('button', { name: 'Split', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Merge with the/ })).toHaveCount(0);
});
