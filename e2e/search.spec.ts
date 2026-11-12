import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('searches, filters, selects, and restores a history result', async ({ page, isMobile }) => {
	await page.goto('/dev/seed?scenario=idle');
	await expect(page.locator('[data-seed-status]')).toHaveText('Seeded idle');
	await page.goto('/history');
	const notNow = page.getByRole('button', { name: 'Not now' });
	await notNow.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
	if (await notNow.isVisible().catch(() => false)) await notNow.click();
	await page.getByRole('searchbox', { name: 'Search sessions' }).fill('库存');
	const result = page.getByText('库存管理系统开发', { exact: true }).first();
	await expect(result).toBeVisible();
	await page.getByRole('button', { name: 'Work', exact: true }).click();
	await expect(page.getByText('1 session,')).toBeVisible();
	const shots = process.env.HT_RUN_DIR ? join(process.env.HT_RUN_DIR, 'shots') : undefined;
	if (shots) {
		await mkdir(shots, { recursive: true });
		if (isMobile)
			await page
				.locator('button.session')
				.first()
				.evaluate((row) => row.scrollIntoView({ block: 'center' }));
		await page.screenshot({
			path: join(shots, isMobile ? 'history-results-phone.png' : 'history-results-desktop.png'),
			fullPage: !isMobile,
		});
	}
	await result.click();
	if (isMobile) {
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('button', { name: 'Close' }).click();
	} else {
		await expect(page.getByText('Select a session to see its details.')).toHaveCount(0);
		await expect(page).toHaveURL(/session=/);
		if (shots) {
			await page.screenshot({
				path: join(shots, 'history-desktop-selected-light.png'),
				fullPage: true,
			});
			await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
			await page.screenshot({
				path: join(shots, 'history-desktop-selected-dark.png'),
				fullPage: true,
			});
			await page.evaluate(() => delete document.documentElement.dataset.theme);
		}
		await page.getByLabel('Note').fill('search edit persists');
		await page.getByLabel('Note').press('Tab');
		await expect(page.getByText('Saved')).toBeVisible();
		await page.reload();
		await expect(page.getByLabel('Note')).toHaveValue('search edit persists');
	}
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page).not.toHaveURL(/q=|type=/);
});
