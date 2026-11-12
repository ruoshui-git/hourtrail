import { expect, test, type Page } from '@playwright/test';
import { dismissInstallHint, readRecords, seed } from './helpers/acceptance';

async function localDateTime(page: Page, timestamp: number) {
	return page.evaluate((at) => {
		const date = new Date(at);
		const pad = (part: number) => String(part).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}, timestamp);
}

test('Scenario D: yesterday entries show in History totals without changing today', async ({
	page,
}) => {
	await page.clock.install({ time: new Date('2026-11-12T10:30:00-05:00') });
	await seed(page, 'idle');
	const data = await readRecords(page);
	const inventory = data.work_item.find((item) => item.name === '库存管理系统开发')!;
	const sink = data.work_item.find((item) => item.name === '修复洗手台')!;
	const volunteer = data.activity_type.find((type) => type.name === 'Volunteer')!;
	await page.goto('/');
	await dismissInstallHint(page);
	const todayTotal = await page.locator('.today-summary p').textContent();
	const day = await page.evaluate(() => {
		const date = new Date();
		date.setDate(date.getDate() - 1);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	});
	await page.goto(`/history?day=${day}`);
	await dismissInstallHint(page);
	const gapAdds = page.getByRole('button', { name: 'Add', exact: true });
	await expect(gapAdds.first()).toBeVisible();
	await gapAdds.first().click();
	await expect(page.getByRole('heading', { name: 'Add session' })).toBeVisible();
	const yesterdayStart = await page.evaluate(() => {
		const date = new Date();
		date.setDate(date.getDate() - 1);
		date.setHours(12, 0, 0, 0);
		return date.getTime();
	});
	await page.getByLabel('Start').fill(await localDateTime(page, yesterdayStart));
	await page.getByLabel('End').fill(await localDateTime(page, yesterdayStart + 60 * 60_000));
	await page.getByLabel('Choose work item').selectOption(inventory.id);
	await page
		.getByRole('dialog', { name: 'Add session' })
		.getByRole('button', { name: 'Add session' })
		.click();
	await expect(page.getByRole('heading', { name: 'Add session' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: 'Add session' })).toBeVisible();
	await page.getByLabel('Start').fill(await localDateTime(page, yesterdayStart + 2 * 60 * 60_000));
	await page.getByLabel('End').fill(await localDateTime(page, yesterdayStart + 3 * 60 * 60_000));
	await page.getByLabel('Choose work item').selectOption(sink.id);
	await page.getByLabel('Activity type').selectOption(volunteer.id);
	await page
		.getByRole('dialog', { name: 'Add session' })
		.getByRole('button', { name: 'Add session' })
		.click();
	await expect(page.locator('button.session').filter({ hasText: inventory.name })).toBeVisible();
	await expect(page.getByRole('button', { name: /2:00 PM 3:00 PM 修复洗手台/ })).toBeVisible();
	await expect(page.locator('.totals')).toHaveText('1h 00m work, 3h 29m other');
	const sessions = (await readRecords(page)).session.filter(
		(session) => session.source === 'manual',
	);
	expect(sessions).toHaveLength(2);
	expect(sessions.map((session) => session.source)).toEqual(['manual', 'manual']);
	expect(sessions.map((session) => session.work_item_id)).toEqual([inventory.id, sink.id]);
	expect(sessions.map((session) => session.type_id)).toEqual([inventory.type_id, volunteer.id]);
	await page.goto('/');
	await expect(page.locator('.today-summary p')).toHaveText(todayTotal);
});
