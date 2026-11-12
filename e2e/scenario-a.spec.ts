import { expect, test } from '@playwright/test';
import { openHome, readRecords, seed } from './helpers/acceptance';

test('Scenario A: one tap starts a recent item without opening a form', async ({ page }) => {
	await seed(page, 'idle');
	const item = (await readRecords(page)).work_item.find((row) => row.name === '库存管理系统开发')!;
	await openHome(page);
	await page.getByRole('button', { name: 'Start 库存管理系统开发' }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	await expect(page.getByRole('button', { name: '库存管理系统开发', exact: true })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Name this session' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Add session' })).toHaveCount(0);
	await expect
		.poll(async () => (await readRecords(page)).session.filter((row) => row.end_at === null))
		.toHaveLength(1);
	const running = (await readRecords(page)).session.find((row) => row.end_at === null)!;
	expect(running.work_item_id).toBe(item.id);
});
