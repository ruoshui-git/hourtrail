import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ timezoneId: 'America/New_York', locale: 'en-GB' });

async function openBackup(page: Page) {
	await page.clock.setFixedTime(new Date('2026-11-12T15:30:00Z'));
	await page.goto('/dev/seed?scenario=idle');
	await expect(page.locator('[data-seed-status]')).toHaveText('Seeded idle');
	const hint = page.getByRole('dialog', { name: 'Add Hourtrail to your Home Screen' });
	if (await hint.isVisible()) await hint.getByRole('button', { name: 'Not now' }).click();
	await page.goto('/settings');
	await page.getByRole('link', { name: 'Backup', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
	await expect(page.getByText('No backup yet', { exact: true })).toBeVisible();
	await expect(page.getByText("You haven't downloaded a backup yet.")).toBeVisible();
	await expect(page.getByRole('button', { name: 'Download backup' })).toBeEnabled();
}

async function screenshot(page: Page, name: string) {
	if (!process.env.HT_RUN_DIR) return;
	const directory = join(process.env.HT_RUN_DIR, 'shots');
	await mkdir(directory, { recursive: true });
	await page.evaluate(() => document.fonts.ready);
	await expect(page.locator('body')).toHaveJSProperty(
		'scrollWidth',
		await page.evaluate(() => innerWidth),
	);
	await page.screenshot({ path: join(directory, name), fullPage: true, animations: 'disabled' });
}

test('downloads a complete Unicode backup and remembers the date', async ({ page }, testInfo) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await openBackup(page);
	if (testInfo.project.name === 'webkit-iphone') {
		await screenshot(page, 'backup-no-backup-phone-light.png');
	}
	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download backup' }).click();
	const download = await downloading;
	expect(download.suggestedFilename()).toBe('hourtrail-backup-2026-11-12.json');
	const bytes = await readFile((await download.path())!);
	const file = JSON.parse(bytes.toString('utf8'));
	expect(file.format).toBe('hourtrail-backup');
	expect(file.version).toBe(1);
	expect(file.exported_at).toBe(Date.parse('2026-11-12T15:30:00Z'));
	expect(bytes.includes(Buffer.from('库存管理系统开发', 'utf8'))).toBe(true);
	const snapshot = await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const names = [...db.objectStoreNames].filter((name) => name !== 'local' && name !== 'outbox');
		const tx = db.transaction(names, 'readonly');
		const tables = Object.fromEntries(
			await Promise.all(
				names.map(async (name) => [
					name,
					await new Promise<unknown[]>((resolve, reject) => {
						const rows = tx.objectStore(name).getAll();
						rows.onsuccess = () => resolve(rows.result);
						rows.onerror = () => reject(rows.error);
					}),
				]),
			),
		);
		db.close();
		return tables;
	});
	const { local_fix, ...records } = snapshot;
	expect(file.records).toEqual(records);
	expect(file.local_fixes).toEqual(local_fix);
	expect(file.counts).toEqual(
		Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, rows.length])),
	);
	expect(
		file.records.work_item.some((item: { name: string }) => item.name === '库存管理系统开发'),
	).toBe(true);
	await expect(page.getByText('Backup saved.', { exact: true })).toBeVisible();
	await expect(page.getByText('Last backup: 12 Nov 2026', { exact: true })).toBeVisible();
	await expect(page.getByText("You haven't downloaded a backup yet.")).toHaveCount(0);
	await page.reload();
	await expect(page.getByText('Last backup: 12 Nov 2026', { exact: true })).toBeVisible();
	if (testInfo.project.name === 'chromium') {
		await page.emulateMedia({ colorScheme: 'dark' });
		await screenshot(page, 'backup-after-backup-desktop-dark.png');
	}
});

test('cancelled and failed shares keep the date unchanged; a completed share saves it', async ({
	page,
}) => {
	await openBackup(page);
	await page.evaluate(() => {
		let calls = 0;
		Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
		Object.defineProperty(navigator, 'canShare', {
			configurable: true,
			value: ({ files }: ShareData) => files?.length === 1,
		});
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async ({ files }: ShareData) => {
				if (calls++ === 0) throw new DOMException('Cancelled', 'AbortError');
				if (calls === 2) throw new Error('Share failed');
				const file = files?.[0];
				if (
					!file ||
					file.name !== 'hourtrail-backup-2026-11-12.json' ||
					!(await file.text()).includes('库存管理系统开发')
				) {
					throw new Error('Incorrect shared file');
				}
			},
		});
	});
	const button = page.getByRole('button', { name: 'Download backup' });
	await button.click();
	await expect(button).toBeEnabled();
	await expect(page.getByText('No backup yet', { exact: true })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByText('Backup saved.', { exact: true })).toHaveCount(0);
	await button.click();
	await expect(page.getByRole('alert')).toHaveText(
		'The backup could not be saved. Try downloading it again.',
	);
	await expect(page.getByText('No backup yet', { exact: true })).toBeVisible();
	await button.click();
	await expect(page.getByText('Backup saved.', { exact: true })).toBeVisible();
	await expect(page.getByText('Last backup: 12 Nov 2026', { exact: true })).toBeVisible();
});
