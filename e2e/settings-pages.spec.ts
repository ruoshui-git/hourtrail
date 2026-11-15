import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { dismissInstallHint, readRecords, seed } from './helpers/acceptance';

test.use({ actionTimeout: 15_000 });

async function readSettings(page: Page) {
	return page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const rows = await new Promise<{ id: string; value: unknown }[]>((resolve, reject) => {
			const query = database.transaction('setting').objectStore('setting').getAll();
			query.onsuccess = () => resolve(query.result);
			query.onerror = () => reject(query.error);
		});
		database.close();
		return Object.fromEntries(rows.map((row) => [row.id, row.value]));
	});
}

async function enterZoneSearch(page: Page, value: string) {
	const input = page.getByRole('textbox', { name: 'Search time zones' });
	await input.evaluate((element, text) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(element, text);
		element.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await expect(input).toHaveValue(value);
}

test('settings list links to the available pages', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByText('Coming soon')).toHaveCount(0);
	for (const label of ['Projects', 'Time zone and week start', 'Deleted sessions', 'About']) {
		await expect(page.getByRole('link', { name: new RegExp(label) })).toBeVisible();
	}
	await expect(page.getByRole('link', { name: 'Projects' })).toHaveAttribute(
		'href',
		'/items/projects',
	);
});

test('time settings save the reporting zone and week start and change History day', async ({
	page,
}) => {
	await page.clock.setFixedTime(new Date('2026-11-13T02:00:00Z'));
	await seed(page, 'idle');
	await page.goto('/settings/time');
	await dismissInstallHint(page);
	await enterZoneSearch(page, 'tokyo');
	await page.getByRole('button', { name: /Asia\/Tokyo/ }).click();
	await expect(
		page.getByText('Days are now counted in Asia/Tokyo.', { exact: true }),
	).toBeVisible();
	await expect.poll(async () => (await readSettings(page)).reporting_tz).toBe('Asia/Tokyo');
	await page.getByRole('radio', { name: 'Sunday' }).click();
	await expect.poll(async () => (await readSettings(page)).week_start).toBe(7);
	await page.goto('/history');
	await expect(page.getByRole('heading', { name: /Friday, November 13/i })).toBeVisible();
	await page.goto('/settings/time');
	await enterZoneSearch(page, 'new york');
	const newYorkZone = page.getByRole('button', { name: /America\/New_York/ }).last();
	await expect(newYorkZone).toBeVisible();
	await newYorkZone.click();
	await expect.poll(async () => (await readSettings(page)).reporting_tz).toBe('America/New_York');
	await page.goto('/history');
	await expect(page.getByRole('heading', { name: /Thursday, November 12/i })).toBeVisible();
});

test('a deleted session can be restored with its name and times', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-11-12T12:00:00-05:00') });
	await seed(page, 'idle');
	const original = await readRecords(page);
	const dayStart = new Date('2026-11-12T00:00:00-05:00').getTime();
	const session = original.session.find(
		(row) => row.deleted_at === null && row.end_at !== null && row.start_at >= dayStart,
	);
	expect(session).toBeTruthy();
	expect(session?.work_item_id).toBeTruthy();
	if (!session?.work_item_id) return;
	await page.evaluate(async (itemId) => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = database.transaction('work_item', 'readwrite');
		const store = tx.objectStore('work_item');
		const item = await new Promise<Record<string, unknown>>((resolve, reject) => {
			const get = store.get(itemId);
			get.onsuccess = () => resolve(get.result);
			get.onerror = () => reject(get.error);
		});
		store.put({ ...item, name: '库存管理系统开发' });
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		database.close();
	}, session.work_item_id);

	await page.goto('/history');
	await dismissInstallHint(page);
	const row = page.locator('button.session').filter({ hasText: '库存管理系统开发' }).first();
	await expect(row).toBeVisible();
	await row.click();
	await page.getByRole('button', { name: 'Delete session' }).first().click();
	await page.locator('.dialog').getByRole('button', { name: 'Delete session' }).click();
	await expect
		.poll(
			async () =>
				(await readRecords(page)).session.find((item) => item.id === session.id)?.deleted_at,
		)
		.not.toBeNull();
	await page.goto('/settings/deleted');
	const deletedRow = page.locator('li').filter({ hasText: '库存管理系统开发' });
	await expect(deletedRow).toContainText('Restore');
	if (test.info().project.name === 'chromium' && process.env.HT_RUN_DIR) {
		const directory = join(process.env.HT_RUN_DIR, 'shots');
		await mkdir(directory, { recursive: true });
		for (const colorScheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme });
			for (const [name, width, height] of [
				['phone', 390, 844],
				['desktop', 1280, 800],
			] as const) {
				await page.setViewportSize({ width, height });
				await page.screenshot({
					path: join(directory, `settings-deleted-populated-${name}-${colorScheme}.png`),
					fullPage: true,
				});
			}
		}
		await page.emulateMedia({ colorScheme: 'light' });
		await page.setViewportSize({ width: 1280, height: 800 });
	}
	await deletedRow.getByRole('button', { name: 'Restore' }).click();
	await expect(page.getByText('Session restored.', { exact: true })).toBeVisible();
	await expect(deletedRow).toHaveCount(0);
	await page.goto('/history');
	await expect(page.getByRole('button', { name: /库存管理系统开发/ }).first()).toBeVisible();
	await expect
		.poll(async () => {
			const row = (await readRecords(page)).session.find((item) => item.id === session.id);
			return row && { start_at: row.start_at, end_at: row.end_at, deleted_at: row.deleted_at };
		})
		.toEqual({ start_at: session.start_at, end_at: session.end_at, deleted_at: null });
});

test('About shows build information and the device storage state', async ({ page }) => {
	await page.goto('/settings/about');
	await expect(page.getByText(/^Version .* · build .* ·/)).toBeVisible();
	await expect(
		page.getByText(/Storage: .* MB used|Storage: Storage usage unavailable/),
	).toBeVisible();
	await expect(
		page.getByText(
			'A personal time tracker. Your records stay on your devices and your own cloud.',
		),
	).toBeVisible();
});

test('Deleted sessions shows its empty state on a new device', async ({ page }) => {
	await page.goto('/settings/deleted');
	await expect(page.getByText('No deleted sessions.', { exact: true })).toBeVisible();
});
