import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { newId, splitByDay } from '../packages/core/src/index';
import { dismissInstallHint, readRecords, seed } from './helpers/acceptance';
import type { AcceptanceData } from './helpers/acceptance';
import { seedRecords } from './helpers/scenarios';

test.use({ actionTimeout: 15_000 });

// Noon in New York, so the idle seed's sessions (all within the last 26 hours) fall on
// Nov 11 and Nov 12, and the month, week and day views below have known totals.
const PINNED = new Date('2026-11-12T12:00:00-05:00');
const ZONE = 'America/New_York';

/** Minutes as core's formatHours prints them: "3h 13m", "1h 00m", "45m". */
function hm(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

/** Whole minutes of every live session of one type, summed from the stored records. */
function minutesOf(data: AcceptanceData, typeId: string): number {
	return data.session
		.filter((session) => session.type_id === typeId && session.end_at !== null)
		.filter((session) => session.deleted_at === null)
		.reduce((sum, session) => sum + Math.round((session.end_at! - session.start_at) / 60_000), 0);
}

function typeId(data: AcceptanceData, name: string): string {
	const found = data.activity_type.find((type) => type.name === name);
	if (!found) throw new Error(`Missing activity type ${name}`);
	return found.id;
}

/** The StatTile whose label is `label`, so its figure can be read. */
function tile(page: Page, label: string) {
	return page.locator('.stat').filter({ has: page.getByText(label, { exact: true }) });
}

async function openReports(page: Page) {
	await page.goto('/reports');
	await dismissInstallHint(page);
	await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
}

test('Month totals count Work only, Overhead sits beside them, and a rename does not change that', async ({
	page,
}) => {
	await page.clock.install({ time: PINNED });
	await seed(page, 'idle');
	const before = await readRecords(page);
	const overhead = typeId(before, 'Overhead');
	const work = typeId(before, 'Work');
	const teamMeeting = before.work_item.find((item) => item.name === 'Team meeting')!;

	// One hour of Overhead on Nov 12, 10:30 to 11:30, under the Team meeting item.
	const now = Date.now();
	const common = () => ({
		id: newId(),
		rev: 0,
		created_at: now,
		updated_at: now,
		updated_by: '',
		deleted_at: null,
	});
	await seedRecords(page, {
		session: [
			{
				...common(),
				work_item_id: teamMeeting.id,
				type_id: overhead,
				start_at: new Date('2026-11-12T10:30:00-05:00').getTime(),
				end_at: new Date('2026-11-12T11:30:00-05:00').getTime(),
				start_tz: ZONE,
				end_tz: ZONE,
				note: '',
				source: 'manual',
				place_id: null,
				place_state: 'none',
				place_candidates: [],
				origin_device_id: 'e2e',
				flags: {},
			},
		],
	});
	const seeded = await readRecords(page);
	const workMinutes = minutesOf(seeded, work);
	expect(workMinutes).toBe(193);
	expect(minutesOf(seeded, overhead)).toBe(60);

	await openReports(page);
	await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
	await expect(tile(page, 'Work hours').locator('.value')).toHaveText(hm(workMinutes));
	await expect(tile(page, 'Overhead').locator('.value')).toHaveText(hm(60));
	await expect(tile(page, 'Sessions').locator('.value')).toHaveText(String(seeded.session.length));
	await expect(page.locator('.bar-chart svg')).toBeVisible();

	// Rename Overhead to "Work": it still does not count as work hours (by type id).
	await page.goto('/settings/types');
	await dismissInstallHint(page);
	await page.getByRole('button', { name: 'Options for Overhead' }).click();
	await page.getByRole('menuitem', { name: 'Rename' }).click();
	await page.getByRole('textbox', { name: 'Name' }).fill('Work');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect
		.poll(
			async () =>
				(await readRecords(page)).activity_type.find((type) => type.id === overhead)?.name,
		)
		.toBe('Work');

	await openReports(page);
	await expect(tile(page, 'Work hours').locator('.value')).toHaveText(hm(workMinutes));
	await expect(tile(page, 'Work').locator('.value')).toHaveText(hm(60));
});

test('Week and Day views move with the previous and next buttons, and Custom checks its dates', async ({
	page,
}) => {
	await page.clock.install({ time: PINNED });
	await seed(page, 'idle');
	const data = await readRecords(page);
	const workMinutes = minutesOf(data, typeId(data, 'Work'));

	await openReports(page);
	await page.getByRole('radio', { name: 'Week' }).click();
	await expect(page.getByRole('heading', { name: 'Nov 9–15, 2026' })).toBeVisible();
	await expect(tile(page, 'Work hours').locator('.value')).toHaveText(hm(workMinutes));
	// The table under the chart lists only days with time, then a Total row.
	await expect(page.getByText('Days with recorded time')).toBeVisible();
	await expect(page.getByRole('cell', { name: 'Nov 12', exact: true })).toBeVisible();
	await expect(page.getByRole('cell', { name: 'Nov 9', exact: true })).toHaveCount(0);
	await expect(page.getByRole('cell', { name: 'Total', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Previous week' }).click();
	await expect(page.getByRole('heading', { name: 'Nov 2–8, 2026' })).toBeVisible();
	await expect(page.getByText('No time recorded in this range.')).toBeVisible();
	await expect(page.locator('.bar-chart')).toHaveCount(0);
	await page.getByRole('button', { name: 'Next week' }).click();
	await expect(page.getByRole('heading', { name: 'Nov 9–15, 2026' })).toBeVisible();

	await page.getByRole('radio', { name: 'Day' }).click();
	await expect(page.getByRole('heading', { name: 'Thu, Nov 12, 2026' })).toBeVisible();
	await expect(tile(page, 'Work hours').locator('.value')).toHaveText(hm(workMinutes));
	await page.getByRole('button', { name: 'Previous day' }).click();
	await expect(page.getByRole('heading', { name: 'Wed, Nov 11, 2026' })).toBeVisible();
	// Nov 11 has volunteer time (the midnight-crossing session and the earlier one) but no work.
	await expect(tile(page, 'Work hours').locator('.value')).toHaveText('0m');
	// Expected from core's own allocation: splitByDay cuts each session at local midnight and
	// gives the same minutes the screen sums, so the match is exact.
	const volunteerId = typeId(data, 'Volunteer');
	const nov11 = data.session
		.filter((session) => session.type_id === volunteerId && session.deleted_at === null)
		.filter((session) => session.end_at !== null)
		.flatMap((session) =>
			splitByDay({ start_at: session.start_at, end_at: session.end_at }, ZONE, Date.now()),
		)
		.filter((slice) => slice.day === '2026-11-11')
		.reduce((sum, slice) => sum + slice.minutes, 0);
	await expect(tile(page, 'Volunteer').locator('.value')).toHaveText(hm(nov11));
	await page.getByRole('button', { name: 'Next day' }).click();
	await expect(page.getByRole('heading', { name: 'Thu, Nov 12, 2026' })).toBeVisible();

	await page.getByRole('radio', { name: 'Custom' }).click();
	const from = page.getByRole('textbox', { name: 'From' });
	const to = page.getByRole('textbox', { name: 'To' });
	await expect(from).toHaveValue('2026-11-01');
	await expect(to).toHaveValue('2026-11-30');
	await from.fill('2026-11-12');
	await to.fill('2026-11-12');
	await expect(page.getByRole('heading', { name: 'Thu, Nov 12, 2026' })).toBeVisible();
	await expect(tile(page, 'Work hours').locator('.value')).toHaveText(hm(workMinutes));
	await to.fill('2026-11-01');
	await expect(page.getByText('The first date must be on or before the last date.')).toBeVisible();
});

test('Breakdowns keep Chinese names intact, and an empty month says what to do', async ({
	page,
}) => {
	await page.clock.install({ time: PINNED });
	await seed(page, 'idle');

	await openReports(page);
	await expect(page.getByRole('radio', { name: 'Work items' })).toBeChecked();
	await expect(page.getByText('库存管理系统开发').first()).toBeVisible();
	await expect(page.getByText('修复洗手台').first()).toBeVisible();

	await page.getByRole('radio', { name: 'Projects' }).click();
	await expect(page.getByText('Temple').first()).toBeVisible();
	await expect(page.getByText('No project').first()).toBeVisible();
	await page.getByRole('radio', { name: 'Places' }).click();
	await expect(page.getByText('No place').first()).toBeVisible();

	await page.getByRole('button', { name: 'Previous month' }).click();
	await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
	await expect(page.getByText('No time recorded in this range.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Create report' })).toHaveAttribute(
		'href',
		'/reports/new',
	);
});

test('Statistics screenshots for phone and desktop, light and dark', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'chromium' || !process.env.HT_RUN_DIR, 'screenshots only');
	const directory = join(process.env.HT_RUN_DIR!, 'shots');
	await mkdir(directory, { recursive: true });
	await page.clock.install({ time: PINNED });
	await seed(page, 'idle');

	for (const [name, size] of [
		['phone', { width: 390, height: 844 }],
		['desktop', { width: 1280, height: 800 }],
	] as const) {
		for (const theme of ['Light', 'Dark'] as const) {
			await page.setViewportSize(size);
			await page.goto('/settings/appearance');
			await page.getByRole('radio', { name: theme }).click();
			await openReports(page);
			const prefix = `statistics-${name}-${theme.toLowerCase()}`;

			await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
			await page.screenshot({ path: join(directory, `${prefix}-month.png`), fullPage: true });

			await page.getByRole('radio', { name: 'Week' }).click();
			await expect(page.getByRole('heading', { name: 'Nov 9–15, 2026' })).toBeVisible();
			await page.screenshot({ path: join(directory, `${prefix}-week.png`), fullPage: true });

			await page.getByRole('radio', { name: 'Month' }).click();
			await page.getByRole('radio', { name: 'Projects' }).click();
			await expect(page.getByText('Temple').first()).toBeVisible();
			await page.screenshot({
				path: join(directory, `${prefix}-projects.png`),
				fullPage: true,
			});

			await page.getByRole('button', { name: 'Previous month' }).click();
			await expect(page.getByText('No time recorded in this range.')).toBeVisible();
			await page.screenshot({ path: join(directory, `${prefix}-empty.png`), fullPage: true });
		}
	}
});
