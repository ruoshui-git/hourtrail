import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

test('Home uses the device day while History uses and can change the reporting zone', async ({
	page,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'timezone acceptance scenario runs in Chromium');
	await page.clock.install({ time: new Date('2026-11-12T02:00:00Z') });
	await page.goto('/dev/seed?scenario=idle');
	await expect(page.locator('[data-seed-status]')).toHaveText('Seeded idle');
	await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = database.transaction(['setting', 'session', 'work_item'], 'readwrite');
		tx.objectStore('setting').put({
			id: 'reporting_tz',
			value: 'Asia/Tokyo',
			rev: 1,
			updated_by: 'test',
			created_at: Date.now(),
			updated_at: Date.now(),
			deleted_at: null,
		});
		const sessions = tx.objectStore('session').getAll();
		sessions.onsuccess = () => {
			const session = sessions.result[0]!;
			session.start_at = Date.parse('2026-11-12T02:00:00Z');
			session.end_at = Date.parse('2026-11-12T04:00:00Z');
			session.start_tz = 'America/New_York';
			session.end_tz = 'America/New_York';
			session.note = 'timezone fixture';
			tx.objectStore('session').put(session);
			if (session.work_item_id) {
				const items = tx.objectStore('work_item');
				const itemRequest = items.get(session.work_item_id);
				itemRequest.onsuccess = () => {
					itemRequest.result.name = '库存管理系统开发';
					items.put(itemRequest.result);
				};
			}
		};
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		database.close();
	});
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Wed, Nov 11' })).toBeVisible();
	await expect(page.getByText('Statistics and History use Asia/Tokyo days.')).toBeVisible();
	if (process.env.HT_RUN_DIR)
		await page.screenshot({ path: `${process.env.HT_RUN_DIR}/shots/home-zone-note.png` });
	await expect(
		page.getByRole('button', { name: /库存管理系统开发, 9:00 PM to 11:00 PM/ }),
	).toBeVisible();
	await page.goto('/history');
	await expect(page.getByRole('heading', { name: /Thursday, November 12/i })).toBeVisible();
	await expect(
		page.getByRole('button', { name: /库存管理系统开发, 11:00 AM to 1:00 PM/ }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Use America/New_York' }).click();
	await expect(page.getByText('Days are shown in Asia/Tokyo.')).toHaveCount(0);
	const zone = await page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const setting = await new Promise<{ value: string }>((resolve, reject) => {
			const get = database.transaction('setting').objectStore('setting').get('reporting_tz');
			get.onsuccess = () => resolve(get.result);
			get.onerror = () => reject(get.error);
		});
		database.close();
		return setting.value;
	});
	expect(zone).toBe('America/New_York');
});
