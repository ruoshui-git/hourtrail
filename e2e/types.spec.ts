import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function records(page: Page) {
	return page.evaluate(async () => {
		const request = indexedDB.open('hourtrail');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return await new Promise<
			{
				id: string;
				name: string;
				sort_key: number;
				counts_as_work: boolean;
				color: string;
				deleted_at: number | null;
			}[]
		>((resolve, reject) => {
			const query = database.transaction('activity_type').objectStore('activity_type').getAll();
			query.onsuccess = () => resolve(query.result);
			query.onerror = () => reject(query.error);
		});
	});
}

test('activity types and appearance persist by id', async ({ page }) => {
	await page.goto('/settings/types');
	await expect(page.getByRole('heading', { name: 'Activity types' })).toBeVisible();
	const notNow = page.getByRole('button', { name: 'Not now' });
	if (await notNow.isVisible().catch(() => false)) await notNow.click();
	const defaults = await records(page);
	const overheadId = defaults.find((type) => type.name === 'Overhead')!.id;
	const volunteerId = defaults.find((type) => type.name === 'Volunteer')!.id;

	await page.getByRole('button', { name: 'Add activity type' }).click();
	await page.getByRole('textbox', { name: 'Name' }).fill('志愿活动');
	await page.getByRole('radio', { name: 'Saffron' }).check();
	await page.getByRole('button', { name: 'Add activity type', exact: true }).last().click();
	await expect(page.getByText('志愿活动')).toBeVisible();

	await page.getByRole('button', { name: 'Options for Overhead' }).click();
	await page.getByRole('menuitem', { name: 'Rename' }).click();
	await page.getByRole('textbox', { name: 'Name' }).fill('Meetings');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.getByRole('button', { name: 'Options for Meetings' }).click();
	await page.getByRole('menuitem', { name: 'Move up' }).click();

	await page.getByRole('button', { name: 'Options for Volunteer' }).click();
	await page.getByRole('menuitem', { name: 'Rename' }).click();
	await page.getByRole('switch', { name: 'Counts as work' }).click();
	await page.getByRole('button', { name: 'Save' }).click();

	await page.getByRole('button', { name: 'Options for 志愿活动' }).click();
	await page.getByRole('menuitem', { name: 'Archive' }).click();
	await expect(page.getByText('Activity type archived.')).toBeVisible();
	await page.getByRole('button', { name: /Archived/ }).click();
	await page.getByRole('button', { name: 'Restore' }).click();

	const beforeReload = await records(page);
	const custom = beforeReload.find((type) => type.name === '志愿活动')!;
	expect(custom.color).toBe('saffron');
	expect(custom.deleted_at).toBeNull();
	expect(beforeReload.find((type) => type.name === 'Meetings')!.id).toBe(overheadId);
	expect(beforeReload.find((type) => type.name === 'Volunteer')!.id).toBe(volunteerId);
	expect(beforeReload.find((type) => type.name === 'Volunteer')!.counts_as_work).toBe(true);
	const visibleOrder = beforeReload
		.filter((type) => type.deleted_at === null && type.archived_at === null)
		.sort((a, b) => a.sort_key - b.sort_key)
		.map((type) => type.name);
	expect(visibleOrder.indexOf('Meetings')).toBe(visibleOrder.indexOf('Work') - 1);

	await page.goto('/settings/appearance');
	await page.getByRole('radio', { name: 'Dark' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.reload();
	await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

	const afterReload = await records(page);
	expect(afterReload.find((type) => type.name === 'Meetings')!.id).toBe(overheadId);
	expect(afterReload.find((type) => type.name === 'Volunteer')!.id).toBe(volunteerId);
	expect(afterReload.find((type) => type.name === '志愿活动')!.id).toBe(custom.id);

	if (test.info().project.name === 'chromium' && process.env.HT_RUN_DIR) {
		const directory = join(process.env.HT_RUN_DIR, 'shots');
		await mkdir(directory, { recursive: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole('radio', { name: 'Light' }).click();
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
		await page.screenshot({ path: join(directory, 'settings-phone-light.png'), fullPage: true });

		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/settings/appearance');
		await page.getByRole('radio', { name: 'Dark' }).click();
		await page.goto('/settings/types');
		await expect(page.getByRole('heading', { name: 'Activity types' })).toBeVisible();
		await page.screenshot({
			path: join(directory, 'settings-types-desktop-dark.png'),
			fullPage: true,
		});
	}
});
