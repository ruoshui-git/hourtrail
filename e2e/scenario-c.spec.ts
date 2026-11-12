import { expect, test } from '@playwright/test';
import { clearSessions, openHome, readRecords, seed } from './helpers/acceptance';

test('Scenario C: History notes stay distinct and attached to their work item', async ({
	page,
}) => {
	await page.clock.install({ time: new Date('2026-11-12T04:00:00-05:00') });
	await seed(page, 'idle');
	await clearSessions(page);
	const item = (await readRecords(page)).work_item.find((row) => row.name === '库存管理系统开发')!;
	await openHome(page);
	await page.getByRole('textbox', { name: 'Search or name a work item' }).fill(item.name);
	await page.getByRole('button', { name: item.name, exact: true }).click();
	await page.clock.fastForward('03:00:00');
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.clock.fastForward('02:00:00');
	await page.getByRole('button', { name: `Start ${item.name}` }).click();
	await page.clock.fastForward('01:00:00');
	await page.getByRole('link', { name: 'History' }).click();
	const rows = page.locator('button.session').filter({ hasText: item.name });
	await expect(rows).toHaveCount(2);
	await rows.nth(0).click();
	await expect(page.getByRole('heading', { name: 'Edit session' })).toBeVisible();
	await page.getByLabel('Note').fill('早晨记录：库存管理系统开发 🙂');
	await page.getByLabel('Note').blur();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	const latestRows = page.locator('button.session').filter({ hasText: item.name });
	await latestRows.nth(1).click();
	await page.getByLabel('Note').fill('下午记录！第1寺院 / 修复洗手台');
	await page.getByLabel('Note').blur();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	const data = await readRecords(page);
	const sessions = data.session.sort((a, b) => a.start_at - b.start_at);
	expect(sessions.map((row) => row.note)).toEqual([
		'早晨记录：库存管理系统开发 🙂',
		'下午记录！第1寺院 / 修复洗手台',
	]);
	expect(sessions.map((row) => row.work_item_id)).toEqual([item.id, item.id]);
	await expect(page.getByText('早晨记录：库存管理系统开发 🙂')).toBeVisible();
	await expect(page.getByText('下午记录！第1寺院 / 修复洗手台')).toBeVisible();
});
