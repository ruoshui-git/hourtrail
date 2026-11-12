import { expect, test } from '@playwright/test';
import { dismissInstallHint, openHome, readRecords } from './helpers/acceptance';

test('Unicode names and notes survive reload byte for byte', async ({ page }) => {
	const names = ['库存管理系统开发', '第1寺院', '修复洗手台', '巡检 🚲！? / 完成'];
	await page.goto('/items');
	await dismissInstallHint(page);
	for (const name of names) {
		await page.getByRole('button', { name: 'Add work item' }).first().click();
		await page.getByLabel('Name').fill(name);
		await page
			.getByRole('dialog', { name: 'Add work item' })
			.getByRole('button', { name: 'Add work item' })
			.click();
		await expect(page.getByRole('dialog', { name: 'Add work item' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: `${name} Work`, exact: true })).toBeVisible();
	}
	await openHome(page);
	await page.getByRole('textbox', { name: 'Search or name a work item' }).fill(names[0]!);
	await page.getByRole('button', { name: names[0]!, exact: true }).click();
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.getByRole('link', { name: 'History' }).click();
	await page.locator('button.session').filter({ hasText: names[0]! }).click();
	await expect(page.getByRole('heading', { name: 'Edit session' })).toBeVisible();
	const note = '第1寺院 · 修复洗手台：库存管理系统开发 🚲！?';
	await page.getByLabel('Note').fill(note);
	await page.getByLabel('Note').blur();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	await page.reload();
	await expect(page.locator('button.session').filter({ hasText: names[0]! })).toBeVisible();
	const records = await readRecords(page);
	for (const name of names) expect(records.work_item.map((item) => item.name)).toContain(name);
	expect(records.session.find((session) => session.note === note)?.note).toBe(note);
	await page.goto('/history');
	await expect(page.getByText(note, { exact: true })).toBeVisible();
	for (const name of names) {
		await page.goto('/items');
		await expect(page.getByText(name, { exact: true })).toBeVisible();
	}
});
