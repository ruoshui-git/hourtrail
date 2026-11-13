import { expect, test } from '@playwright/test';
import { clearSessions, openHome, readRecords, seed } from './helpers/acceptance';

test('Scenario B: resuming work creates a second independent session', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-11-12T04:00:00-05:00') });
	await seed(page, 'idle');
	await clearSessions(page);
	const item = (await readRecords(page)).work_item.find((row) => row.name === '库存管理系统开发')!;
	await openHome(page);
	await page.getByRole('textbox', { name: 'Search or name a work item' }).fill(item.name);
	await page.getByRole('button', { name: item.name, exact: true }).click();
	await page.clock.fastForward('03:00:00');
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect.poll(async () => (await readRecords(page)).session[0]?.end_at).not.toBeNull();
	const completedFirst = (await readRecords(page)).session[0]!;
	await page.clock.fastForward('02:00:00');
	await page.getByRole('button', { name: `Start ${item.name}` }).click();
	await expect.poll(async () => (await readRecords(page)).session.length).toBe(2);
	const sessions = (await readRecords(page)).session;
	expect(sessions).toHaveLength(2);
	const [first, second] = sessions.sort((a, b) => a.start_at - b.start_at);
	expect(first).toEqual(completedFirst);
	expect(Math.abs(first!.start_at - new Date('2026-11-12T04:00:00-05:00').getTime())).toBeLessThan(
		60_000,
	);
	expect(Math.abs(first!.end_at! - new Date('2026-11-12T07:00:00-05:00').getTime())).toBeLessThan(
		60_000,
	);
	expect(Math.abs(second!.start_at - new Date('2026-11-12T09:00:00-05:00').getTime())).toBeLessThan(
		60_000,
	);
	expect(second!.end_at).toBeNull();
	expect(first!.work_item_id).toBe(item.id);
	expect(second!.work_item_id).toBe(item.id);
	await page.getByRole('link', { name: 'History' }).click();
	await expect(page.locator('button.session').filter({ hasText: item.name })).toHaveCount(2);
});
