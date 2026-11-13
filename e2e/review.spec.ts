import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seed } from './helpers/acceptance';

async function closeInstallHint(page: Page) {
	const button = page.getByRole('button', { name: 'Not now' });
	await button.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
	if (await button.isVisible().catch(() => false))
		await button.evaluate((element) => element.click());
	await expect(button).toHaveCount(0, { timeout: 5000 });
}

test('Home review row opens a day review and fixes, marks, conflicts, and finishes it', async ({
	page,
}) => {
	// Pin the clock so "yesterday" and its gaps do not depend on when the suite runs.
	await page.clock.install({ time: new Date('2026-11-12T20:00:00-05:00') });
	await seed(page, 'idle');
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = database.transaction(['session', 'conflict'], 'readwrite');
		const sessions = tx.objectStore('session');
		const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
			const query = sessions.getAll();
			query.onsuccess = () => resolve(query.result);
			query.onerror = () => reject(query.error);
		});
		const yesterday = Date.now() - 26 * 60 * 60_000;
		const affected = rows.filter(
			(row) =>
				Number(row.start_at) > yesterday - 24 * 60 * 60_000 &&
				Number(row.start_at) < yesterday + 24 * 60 * 60_000,
		);
		const localYesterday = new Date();
		localYesterday.setDate(localYesterday.getDate() - 1);
		localYesterday.setHours(0, 0, 0, 0);
		for (const [index, session] of affected.slice(0, 2).entries()) {
			session.start_at = localYesterday.getTime() + (index === 0 ? 9 : 15) * 60 * 60_000;
			session.end_at = session.start_at + 60 * 60_000;
			session.start_tz = 'America/New_York';
			session.end_tz = 'America/New_York';
			sessions.put(session);
		}
		const untitled = affected[0]!;
		untitled.work_item_id = null;
		untitled.note = '';
		untitled.type_id = '00000000-0000-7000-8000-000000000001';
		untitled.place_state = 'unresolved';
		sessions.put(untitled);
		const conflicts = tx.objectStore('conflict');
		for (const [index, session] of affected.slice(0, 2).entries()) {
			const end = Number(session.end_at);
			conflicts.put({
				id: `00000000-0000-7000-8000-00000000000${index + 1}`,
				rev: 0,
				created_at: Date.now(),
				updated_at: Date.now(),
				updated_by: 'test-device',
				deleted_at: null,
				entity: 'session',
				record_id: session.id,
				field: 'end_at',
				kept_value: end,
				other_value: end - 15 * 60_000,
				kept_device: 'Here',
				other_device: 'Other device',
				at: Date.now(),
				resolved_at: null,
			});
		}
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		database.close();
	});

	await page.goto('/');
	await closeInstallHint(page);
	const row = page.getByRole('link', { name: /Yesterday: \d+ things to check/ });
	await expect(row).toBeVisible();
	const browser = page.context().browser()?.browserType().name() ?? 'browser';
	const shotsDir = process.env.HT_RUN_DIR
		? join(process.env.HT_RUN_DIR, 'shots')
		: '/tmp/hourtrail-review-shots';
	mkdirSync(shotsDir, { recursive: true });
	if (browser === 'chromium') await page.emulateMedia({ colorScheme: 'dark' });
	await page.screenshot({
		path: join(shotsDir, `home-review-row-${browser}.png`),
		fullPage: browser !== 'webkit',
	});
	await row.click();
	await expect(page).toHaveURL(/\/history\/review\?day=/);
	await expect(page.getByRole('heading', { name: 'Things to check' })).toBeVisible();
	await expect(page.getByText(/not recorded/).first()).toBeVisible();
	await expect(page.getByText(/End time was set on two devices/).first()).toBeVisible();
	if (browser === 'webkit') {
		await page.evaluate(() => {
			const heading = document.querySelector('#issues-heading');
			if (heading) window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 24);
		});
	}
	await page.screenshot({
		path: join(shotsDir, `daily-review-${browser}.png`),
		fullPage: browser !== 'webkit',
	});

	await page.getByRole('button', { name: 'Name it' }).click();
	await page.getByLabel('Choose work item').selectOption({ label: 'Building Maintenance' });
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByText('Untitled session,', { exact: false })).toHaveCount(0);

	await page.getByRole('button', { name: 'Add session', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Add session', exact: true }).last()).toBeVisible();
	await page.getByRole('button', { name: 'Add session', exact: true }).last().click();
	await expect(page.getByText(/not recorded/).first()).toHaveCount(0);

	await page.getByRole('button', { name: 'Mark reviewed' }).first().click();
	await page.reload();
	await expect(page.getByText('Done (', { exact: false })).toBeVisible();
	await page.locator('details summary').click();
	await page.locator('details').getByRole('button', { name: 'Undo' }).first().click();
	await expect(page.getByRole('button', { name: 'Mark reviewed' }).first()).toBeVisible();
	await page.getByRole('button', { name: 'Dismiss' }).first().click();
	await page.reload();
	await page.locator('details summary').click();
	await expect(page.locator('details').getByRole('button', { name: 'Undo' }).first()).toBeVisible();
	await page.locator('details').getByRole('button', { name: 'Undo' }).first().click();
	await expect(page.locator('details')).toHaveCount(0);

	await page.getByRole('button', { name: 'Use other value' }).first().click();
	const usedOther = await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const [conflicts, sessions] = await Promise.all([
			new Promise<Record<string, unknown>[]>((resolve, reject) => {
				const query = database.transaction('conflict', 'readonly').objectStore('conflict').getAll();
				query.onsuccess = () => resolve(query.result);
				query.onerror = () => reject(query.error);
			}),
			new Promise<Record<string, unknown>[]>((resolve, reject) => {
				const query = database.transaction('session', 'readonly').objectStore('session').getAll();
				query.onsuccess = () => resolve(query.result);
				query.onerror = () => reject(query.error);
			}),
		]);
		database.close();
		const conflict = conflicts.find((row) => String(row.id).endsWith('000000000001'))!;
		const session = sessions.find((row) => row.id === conflict.record_id)!;
		return conflict.resolved_at !== null && session.end_at === conflict.other_value;
	});
	expect(usedOther).toBe(true);
	await expect(page.getByText(/End time was set on two devices/)).toHaveCount(1);
	await page.getByRole('button', { name: 'Keep current value' }).first().click();
	await expect(page.getByText(/End time was set on two devices/)).toHaveCount(0);

	await page.getByRole('button', { name: 'Finish review' }).click();
	await expect(page.getByText(/Review finished\./)).toBeVisible();
	await page.goto('/');
	await closeInstallHint(page);
	await expect(page.getByRole('link', { name: /Yesterday: \d+ things to check/ })).toHaveCount(0);
	const finished = await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const records = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
			const query = database
				.transaction('day_review', 'readonly')
				.objectStore('day_review')
				.getAll();
			query.onsuccess = () => resolve(query.result);
			query.onerror = () => reject(query.error);
		});
		database.close();
		return records.length;
	});
	expect(finished).toBe(1);
});
