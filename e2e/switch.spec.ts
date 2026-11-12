import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openHome, seed } from './helpers/acceptance';

const shots = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : undefined;

async function addRunningSession(page: Page, count = 1) {
	await openHome(page);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await page.getByRole('button', { name: 'Start 库存管理系统开发' }).click();
	await page.getByRole('button', { name: 'Undo' }).click();
	if (count > 1) {
		// A third concurrent session represents a record arriving from another offline device.
		await page.evaluate((extraCount) => {
			return new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const database = request.result;
					const transaction = database.transaction('session', 'readwrite');
					const store = transaction.objectStore('session');
					const all = store.getAll();
					all.onerror = () => reject(all.error);
					all.onsuccess = () => {
						const records = all.result;
						const current = records.filter(
							(session) => session.end_at === null && session.deleted_at === null,
						);
						const completed = records.filter(
							(session) => session.end_at !== null && session.deleted_at === null,
						);
						const latestStart = Math.max(...current.map((session) => session.start_at));
						for (let index = 0; index < extraCount; index++) {
							const original = completed[index];
							if (!original) throw new Error('No completed session available for sync fixture');
							store.put({
								...original,
								start_at: latestStart - (extraCount - index) * 60_000,
								end_at: null,
								end_tz: null,
								rev: original.rev + 1,
								updated_at: Date.now(),
							});
						}
					};
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
					transaction.onerror = () => reject(transaction.error);
				};
			});
		}, count - 1);
	}
}

async function readSessions(page: Page) {
	return page.evaluate(
		() =>
			new Promise<
				{
					id: string;
					start_at: number;
					end_at: number | null;
					deleted_at: number | null;
					work_item_id: string | null;
				}[]
			>((resolve, reject) => {
				const request = indexedDB.open('hourtrail');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const database = request.result;
					const read = database.transaction('session').objectStore('session').getAll();
					read.onerror = () => reject(read.error);
					read.onsuccess = () => {
						database.close();
						resolve(read.result);
					};
				};
			}),
	);
}

test('Switch searches, creates a named item, and Undo restores the previous session', async ({
	page,
}) => {
	await seed(page, 'running');
	await openHome(page);
	await page.getByRole('button', { name: 'Switch' }).click();
	const search = page.getByRole('textbox', { name: 'Search items' });
	await search.fill('修复洗手台');
	await page
		.getByRole('dialog', { name: 'Switch activity' })
		.getByRole('button', { name: /^修复洗手台/ })
		.first()
		.click();
	await expect(page.getByText('Switched to 修复洗手台')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('button', { name: '库存管理系统开发', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Switch' }).click();
	await page.getByRole('textbox', { name: 'Search items' }).fill('Fix the garden gate');
	await page.getByRole('button', { name: 'Start “Fix the garden gate”' }).click();
	await expect(page.getByText('Switched to Fix the garden gate')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	const records = await readSessions(page);
	expect(
		records.filter((session) => session.end_at === null && session.deleted_at === null),
	).toHaveLength(1);
	if (shots && test.info().project.name === 'chromium') {
		await mkdir(shots, { recursive: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
		await page.getByRole('button', { name: 'Switch' }).click();
		const dialog = page.getByRole('dialog', { name: 'Switch activity' });
		await dialog.getByRole('textbox', { name: 'Search items' }).scrollIntoViewIfNeeded();
		await page.screenshot({ path: join(shots, 'switch-sheet-phone-light.png') });
	}
});

test('a Recent row switches the running session and offers Undo', async ({ page }) => {
	await seed(page, 'running');
	await openHome(page);
	await page.getByRole('button', { name: 'Start Building Maintenance' }).click();
	await expect(page.getByText('Switched to Building Maintenance')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('button', { name: '库存管理系统开发', exact: true })).toBeVisible();
});

test('two running sessions resolve at the later start with Undo', async ({ page }) => {
	await seed(page, 'running');
	await addRunningSession(page);
	await openHome(page);
	await expect(
		page.getByRole('status').filter({ hasText: 'Two sessions are running.' }),
	).toBeVisible();
	const sessionsBefore = await readSessions(page);
	const running = sessionsBefore.filter((session) => session.end_at === null);
	expect(running).toHaveLength(2);
	const earlier = [...running].sort((a, b) => a.start_at - b.start_at)[0]!;
	const later = [...running].sort((a, b) => a.start_at - b.start_at)[1]!;
	const resolution = page.getByRole('button', {
		name: /^Stop .+ \(from .+\) at .+$/,
	});
	if (shots && test.info().project.name === 'chromium') {
		await mkdir(shots, { recursive: true });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
		await page.screenshot({
			path: join(shots, 'two-running-banner-desktop-dark.png'),
		});
	}
	await resolution.click();
	let sessionsAfter = await readSessions(page);
	expect(sessionsAfter.find((session) => session.id === earlier.id)?.end_at).toBe(later.start_at);
	await page.getByRole('button', { name: 'Undo' }).click();
	sessionsAfter = await readSessions(page);
	expect(sessionsAfter.find((session) => session.id === earlier.id)?.end_at).toBeNull();
});

test('two running sessions can stop the earlier one now or keep both', async ({ page }) => {
	await seed(page, 'running');
	await addRunningSession(page);
	await openHome(page);
	const running = (await readSessions(page)).filter((session) => session.end_at === null);
	const earlier = [...running].sort((a, b) => a.start_at - b.start_at)[0]!;
	await page.getByRole('button', { name: /Stop .* now/ }).click();
	expect(
		(await readSessions(page)).find((session) => session.id === earlier.id)?.end_at,
	).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await page.getByRole('button', { name: 'Keep both' }).click();
	await expect(page.getByText('Two sessions are running.')).toHaveCount(0);
});

test('more than two running sessions can stop all but the latest', async ({ page }) => {
	await seed(page, 'running');
	await addRunningSession(page, 2);
	await openHome(page);
	const before = (await readSessions(page)).filter((session) => session.end_at === null);
	expect(before).toHaveLength(3);
	const latest = [...before].sort((a, b) => a.start_at - b.start_at).at(-1)!;
	await page.getByRole('button', { name: 'Stop all but the latest' }).click();
	const after = (await readSessions(page)).filter((session) => session.end_at === null);
	expect(after.map((session) => session.id)).toEqual([latest.id]);
});
