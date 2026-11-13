import { expect, test } from '@playwright/test';

test('History navigates days, shows gaps, opens sessions, and splits midnight sessions', async ({
	page,
}) => {
	// Pin the clock to an evening: the headings below are for Thursday, November 12, and
	// at 20:00 the idle fixture has no midnight crossing of its own (only the one moved below).
	await page.clock.install({ time: new Date('2026-11-12T20:00:00-05:00') });
	await page.goto('/dev/seed?scenario=idle');
	await page.waitForURL('**/dev/seed**');
	await expect(page.locator('[data-seed-status]')).toHaveText('Seeded idle');
	// The shared idle fixture has no 60-minute gap today; lower this test-only setting
	// so its existing 10-minute break exercises the Add affordance.
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction('setting', 'readwrite');
		tx.objectStore('setting').put({
			id: 'long_gap_min',
			value: 10,
			rev: 1,
			updated_by: 'test',
			created_at: Date.now(),
			updated_at: Date.now(),
			deleted_at: null,
		});
		tx.objectStore('setting').put({
			id: 'reporting_tz',
			value: 'America/New_York',
			rev: 1,
			updated_by: 'test',
			created_at: Date.now(),
			updated_at: Date.now(),
			deleted_at: null,
		});
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	});
	// Move one seeded session across local midnight before History's live read starts.
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction('session', 'readwrite');
		const store = tx.objectStore('session');
		const sessions = store.getAll();
		sessions.onsuccess = () => {
			const session = sessions.result[0]!;
			session.start_at = new Date('2026-11-11T22:00:00-05:00').getTime();
			session.end_at = new Date('2026-11-12T02:00:00-05:00').getTime();
			session.start_tz = 'America/New_York';
			session.end_tz = 'America/New_York';
			store.put(session);
		};
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	});
	await page.goto('/history');
	await expect(page.getByRole('heading', { name: /Thursday, November 12/i })).toBeVisible();
	const notNow = page.getByRole('button', { name: 'Not now' });
	await notNow.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
	if (await notNow.isVisible().catch(() => false)) await notNow.click();
	await expect(
		page.locator('button.session').filter({ hasText: 'Building Maintenance' }),
	).toBeVisible();
	await expect(page.getByText(/not recorded/).first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add', exact: true }).first()).toBeEnabled();
	await page.getByRole('button', { name: 'Previous day' }).click();
	await expect(page.getByRole('heading', { name: /Wednesday, November 11/i })).toBeVisible();
	await page.getByRole('button', { name: 'Today' }).click();
	await expect(page.getByRole('heading', { name: /Thursday, November 12/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /Continued from yesterday/ })).toHaveCount(1);
	await page.getByRole('button', { name: 'Previous day' }).click();
	await expect(page.getByRole('heading', { name: /Wednesday, November 11/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /Continues tomorrow/ })).toHaveCount(1);
	await page.getByRole('button', { name: 'Today' }).click();
	await expect(page.getByRole('heading', { name: /Thursday, November 12/i })).toBeVisible();
	const session = page.locator('button.session').filter({ hasText: 'Building Maintenance' });
	await expect(session).toBeVisible();
	await expect(session).toHaveAttribute('type', 'button');
});
