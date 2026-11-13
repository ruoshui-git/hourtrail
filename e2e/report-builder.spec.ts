import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DEFAULT_ACTIVITY_TYPES, newId, splitByDay } from '../packages/core/src/index';
import { dismissInstallHint, readRecords, seed } from './helpers/acceptance';
import type { AcceptanceData } from './helpers/acceptance';
import { seedRecords } from './helpers/scenarios';

test.use({ actionTimeout: 15_000 });

// read-excel-file is a dependency of apps/web (not the root), so it is resolved from there.
const webRequire = createRequire(join(process.cwd(), 'apps/web/package.json'));
const readXlsxFile = webRequire('read-excel-file/node') as (
	input: Buffer,
	options: { trim: boolean },
) => Promise<{ sheet: string; data: unknown[][] }[]>;

// Noon in New York on Nov 12, so the idle seed's sessions (Nov 11 and 12) and "This month"
// (November 2026) have known contents.
const PINNED = new Date('2026-11-12T12:00:00-05:00');
const ZONE = 'America/New_York';
const WORK_NOTE = 'Replaced the 库存 filter on the 第1寺院 roof.';
const OVERHEAD_NOTE = 'Weekly sync, 库存 review.';
const INVENTORY_NOTE = '权限开发 and import testing.';

/** Minutes as core's formatHours prints them with the default "hm" format. */
function hm(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function typeId(name: string): string {
	const found = DEFAULT_ACTIVITY_TYPES.find((type) => type.name === name);
	if (!found) throw new Error(`Missing activity type ${name}`);
	return found.id;
}

function workItemId(data: AcceptanceData, name: string): string {
	const found = data.work_item.find((item) => item.name === name);
	if (!found) throw new Error(`Missing work item ${name}`);
	return found.id;
}

/** Allocated minutes of a session inside November, from core's own day split. */
function novemberMinutes(session: { start_at: number; end_at: number | null }): number {
	if (session.end_at === null) return 0;
	return splitByDay({ start_at: session.start_at, end_at: session.end_at }, ZONE, Date.now())
		.filter((slice) => slice.day.startsWith('2026-11'))
		.reduce((sum, slice) => sum + slice.minutes, 0);
}

/** Live, non-deleted, finished sessions. */
function liveSessions(data: AcceptanceData) {
	return data.session.filter((session) => session.deleted_at === null && session.end_at !== null);
}

async function readStore(page: Page, name: string): Promise<Record<string, unknown>[]> {
	return page.evaluate(async (store) => {
		const request = indexedDB.open('hourtrail');
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
			const query = db.transaction(store).objectStore(store).getAll();
			query.onsuccess = () => resolve(query.result);
			query.onerror = () => reject(query.error);
		});
		db.close();
		return rows;
	}, name);
}

async function readPresets(page: Page) {
	return readStore(page, 'report_preset') as Promise<
		{ id: string; name: string; config: Record<string, unknown>; deleted_at: number | null }[]
	>;
}

async function readOutboxEntities(page: Page): Promise<string[]> {
	const rows = await readStore(page, 'outbox');
	return rows.map((row) => String((row.mutation as { entity: string }).entity));
}

/** A finished session record for seedRecords, with the same shape the app writes. */
function sessionRecord(fields: {
	work_item_id: string | null;
	type_id: string;
	start_at: number;
	end_at: number;
	note: string;
}) {
	const now = Date.now();
	return {
		id: newId(),
		rev: 0,
		created_at: now,
		updated_at: now,
		updated_by: '',
		deleted_at: null,
		...fields,
		start_tz: ZONE,
		end_tz: ZONE,
		source: 'manual',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: 'e2e',
		flags: {},
	};
}

/** Idle seed plus one Overhead and one Work session with notes, all in November. */
async function setup(page: Page) {
	await page.clock.install({ time: PINNED });
	await seed(page, 'idle');
	const data = await readRecords(page);
	const teamMeeting = workItemId(data, 'Team meeting');
	const maintenance = workItemId(data, 'Building Maintenance');
	await seedRecords(page, {
		session: [
			sessionRecord({
				work_item_id: teamMeeting,
				type_id: typeId('Overhead'),
				start_at: new Date('2026-11-12T10:30:00-05:00').getTime(),
				end_at: new Date('2026-11-12T11:30:00-05:00').getTime(),
				note: OVERHEAD_NOTE,
			}),
			sessionRecord({
				work_item_id: maintenance,
				type_id: typeId('Work'),
				start_at: new Date('2026-11-11T15:00:00-05:00').getTime(),
				end_at: new Date('2026-11-11T16:00:00-05:00').getTime(),
				note: WORK_NOTE,
			}),
		],
	});
	return readRecords(page);
}

/** On phones the preview is a full-screen view; these move between it and the options. */
async function showPreview(page: Page) {
	const button = page.getByRole('button', { name: 'Preview', exact: true });
	if (await button.isVisible()) await button.click();
	await expect(page.locator('.print-sheet')).toBeVisible();
}

async function showOptions(page: Page) {
	const button = page.getByRole('button', { name: 'Options', exact: true });
	if (await button.isVisible()) await button.click();
}

async function openBuilder(page: Page, { preview = true }: { preview?: boolean } = {}) {
	await page.goto('/reports/new');
	await dismissInstallHint(page);
	await expect(page.getByRole('heading', { name: 'Create report' })).toBeVisible();
	if (preview) await showPreview(page);
}

/** The work total in the preview, as its visible text. */
function workTotal(page: Page): Locator {
	return page.locator('.print-sheet .totals .line.work .value');
}

/** The session row that holds a given note. */
function rowWithNote(page: Page, note: string): Locator {
	return page.locator('.print-sheet tbody.session', { hasText: note });
}

async function exportAs(page: Page, item: 'CSV' | 'Excel' | 'Print') {
	await showOptions(page);
	await page.getByRole('button', { name: 'Export' }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

test('Scenario J: This month aggregates Work hours, lists other types apart, and keeps every note under its work item', async ({
	page,
}) => {
	const data = await setup(page);
	const workSessions = liveSessions(data).filter((s) => s.type_id === typeId('Work'));
	const workMinutes = workSessions.reduce((sum, s) => sum + novemberMinutes(s), 0);
	const overheadMinutes = liveSessions(data)
		.filter((s) => s.type_id === typeId('Overhead'))
		.reduce((sum, s) => sum + novemberMinutes(s), 0);
	const volunteerMinutes = liveSessions(data)
		.filter((s) => s.type_id === typeId('Volunteer'))
		.reduce((sum, s) => sum + novemberMinutes(s), 0);

	await openBuilder(page);
	await expect(page.getByRole('radio', { name: 'This month' })).toBeChecked();
	await expect(page.locator('.print-sheet .range')).toHaveText('November 2026');
	await expect(workTotal(page)).toHaveText(hm(workMinutes));

	// Work hours come first; Overhead and Volunteer follow, each with its own hours.
	await expect(page.locator('.print-sheet .totals > .line').first()).toHaveClass(/work/);
	await expect(page.locator('.print-sheet .totals .line.other')).toHaveCount(2);
	await expect(
		page.locator('.print-sheet .totals .line.other', { hasText: 'Overhead' }).locator('.value'),
	).toHaveText(hm(overheadMinutes));
	await expect(
		page.locator('.print-sheet .totals .line.other', { hasText: 'Volunteer' }).locator('.value'),
	).toHaveText(hm(volunteerMinutes));

	// Each Work session's note sits under its own work item.
	for (const session of workSessions.filter((s) => s.note !== '')) {
		const group = page.locator(`.print-sheet section[data-group="${session.work_item_id}"]`);
		await expect(group).toContainText(session.note);
	}
	await expect(rowWithNote(page, WORK_NOTE)).toContainText('Building Maintenance');
	await expect(rowWithNote(page, INVENTORY_NOTE)).toContainText('库存管理系统开发');
});

test('Excluding a session removes it from totals and the CSV, and it stays visible as Excluded', async ({
	page,
}) => {
	const data = await setup(page);
	const excluded = data.session.find((s) => s.note === WORK_NOTE)!;
	const minutes = novemberMinutes(excluded);
	const workMinutes = liveSessions(data)
		.filter((s) => s.type_id === typeId('Work'))
		.reduce((sum, s) => sum + novemberMinutes(s), 0);
	const allSlices = liveSessions(data).reduce(
		(sum, s) =>
			sum + splitByDay(s, ZONE, Date.now()).filter((x) => x.day.startsWith('2026-11')).length,
		0,
	);
	const excludedSlices = splitByDay(excluded, ZONE, Date.now()).filter((x) =>
		x.day.startsWith('2026-11'),
	).length;

	await openBuilder(page);
	await expect(workTotal(page)).toHaveText(hm(workMinutes));

	const row = rowWithNote(page, WORK_NOTE);
	await row.getByRole('checkbox').uncheck();
	await expect(row).toHaveClass(/excluded/);
	await expect(row.getByText('Excluded', { exact: true })).toBeVisible();
	await expect(workTotal(page)).toHaveText(hm(workMinutes - minutes));

	const [download] = await Promise.all([page.waitForEvent('download'), exportAs(page, 'CSV')]);
	expect(download.suggestedFilename()).toBe('hourtrail-report-2026-11.csv');
	const text = await readFile((await download.path())!, 'utf8');
	expect(text).not.toContain(WORK_NOTE);
	expect(text).toContain(OVERHEAD_NOTE);
	const lines = text
		.replace(/^\uFEFF/, '')
		.split('\r\n')
		.filter(Boolean);
	expect(lines).toHaveLength(1 + allSlices - excludedSlices);

	// Putting it back restores the total.
	await showPreview(page);
	await row.getByRole('checkbox').check();
	await expect(row).not.toHaveClass(/excluded/);
	await expect(workTotal(page)).toHaveText(hm(workMinutes));
});

test('Custom headings show in the preview and as the CSV header row', async ({ page }) => {
	await setup(page);
	await openBuilder(page, { preview: false });

	await page.locator('details.headings summary').click();
	await page.locator('.headings').getByLabel('Work item', { exact: true }).fill('工作项');
	await page.locator('.headings').getByLabel('Date', { exact: true }).fill('日期');
	await showPreview(page);
	await expect(page.locator('.print-sheet thead th', { hasText: '工作项' }).first()).toBeVisible();
	await expect(page.locator('.print-sheet thead th', { hasText: '日期' }).first()).toBeVisible();

	const [download] = await Promise.all([page.waitForEvent('download'), exportAs(page, 'CSV')]);
	const text = await readFile((await download.path())!, 'utf8');
	const header = text.replace(/^\uFEFF/, '').split('\r\n')[0];
	expect(header).toBe(
		'日期,Start,End,Duration,Hours,Type,Counts as work,Project,工作项,Note,Place',
	);
});

test('Presets: save This month, reload, load it for the current month, rename it, then delete it', async ({
	page,
}) => {
	await setup(page);
	await openBuilder(page, { preview: false });

	await page.getByRole('button', { name: 'Presets' }).click();
	await page.getByRole('menuitem', { name: 'Save as preset…' }).click();
	const name = page.getByRole('textbox', { name: 'Name' });
	await name.fill('This month');
	await page.getByRole('button', { name: 'Save preset' }).click();
	await expect
		.poll(async () => (await readPresets(page)).find((p) => p.name === 'This month')?.config)
		.toMatchObject({ relative_range: 'this_month' });
	const saved = (await readPresets(page)).find((p) => p.name === 'This month')!;
	expect(saved.deleted_at).toBeNull();
	expect(await readOutboxEntities(page)).toContain('report_preset');

	// Reload: the preset is still there, and it follows the calendar when loaded.
	await page.reload();
	await dismissInstallHint(page);
	await expect(page.getByRole('heading', { name: 'Create report' })).toBeVisible();
	await page.getByRole('radio', { name: 'Last month' }).click();
	await showPreview(page);
	await expect(page.locator('.print-sheet .range')).toHaveText('October 2026');
	await showOptions(page);

	await page.getByRole('button', { name: 'Presets' }).click();
	await page.getByRole('menuitem', { name: 'This month' }).click();
	await expect(page.getByRole('radio', { name: 'This month' })).toBeChecked();
	await showPreview(page);
	await expect(page.locator('.print-sheet .range')).toHaveText('November 2026');
	await showOptions(page);

	await page.getByRole('button', { name: 'Presets: This month' }).click();
	await page.getByRole('menuitem', { name: 'Rename preset…' }).click();
	await page.getByRole('textbox', { name: 'Name' }).fill('Current month');
	await page.getByRole('button', { name: 'Save name' }).click();
	await expect
		.poll(async () => (await readPresets(page)).find((p) => p.id === saved.id)?.name)
		.toBe('Current month');

	await page.getByRole('button', { name: 'Presets: Current month' }).click();
	await page.getByRole('menuitem', { name: 'Delete preset…' }).click();
	await page.getByRole('button', { name: 'Delete preset' }).click();
	await expect
		.poll(async () => (await readPresets(page)).find((p) => p.id === saved.id)?.deleted_at)
		.not.toBeNull();
});

test('A preset saved by a newer version is refused with a plain message', async ({ page }) => {
	await setup(page);
	await seedRecords(page, {
		report_preset: [
			{
				id: newId(),
				rev: 0,
				created_at: Date.now(),
				updated_at: Date.now(),
				updated_by: '',
				deleted_at: null,
				name: 'From the future',
				config: { range: { from: '2026-11-01', to: '2026-11-30' }, hologram: true },
			},
		],
	});
	await openBuilder(page, { preview: false });
	await page.getByRole('button', { name: 'Presets' }).click();
	await page.getByRole('menuitem', { name: 'From the future' }).click();
	await expect(
		page.getByText("This preset can't be opened. It was saved by a newer version."),
	).toBeVisible();
	await expect(page.getByRole('radio', { name: 'This month' })).toBeChecked();
});

test('Print hides app chrome, repeats table headers, keeps the work total first, and fits A4', async ({
	page,
}) => {
	await setup(page);
	await page.setViewportSize({ width: 794, height: 1123 });
	await openBuilder(page);
	await rowWithNote(page, WORK_NOTE).getByRole('checkbox').uncheck();

	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('.desktop-nav')).toBeHidden();
	await expect(page.locator('.mobile-nav')).toBeHidden();
	await expect(page.locator('.builder-top')).toBeHidden();
	await expect(page.locator('.options-column')).toBeHidden();

	const tables = await page.locator('.print-sheet table').count();
	expect(tables).toBeGreaterThan(0);
	await expect(page.locator('.print-sheet table thead')).toHaveCount(tables);
	const headerDisplay = await page
		.locator('.print-sheet thead')
		.first()
		.evaluate((node) => getComputedStyle(node).display);
	expect(headerDisplay).toBe('table-header-group');

	await expect(page.locator('.print-sheet .totals > .line').first()).toHaveClass(/work/);
	await expect(rowWithNote(page, WORK_NOTE)).toBeHidden();

	// A4 printable width at 96 dpi: 210 mm less two 16 mm margins is about 673 px.
	const sheetWidth = (await page.locator('.print-sheet').boundingBox())!.width;
	expect(sheetWidth).toBeLessThanOrEqual(673);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
	expect(overflow).toBeLessThanOrEqual(794);

	if (process.env.HT_RUN_DIR && test.info().project.name === 'chromium') {
		const directory = join(process.env.HT_RUN_DIR, 'shots');
		await mkdir(directory, { recursive: true });
		await page.screenshot({ path: join(directory, 'report-builder-print-a4.png'), fullPage: true });
	}
});

test('Excel export downloads a workbook whose Sessions sheet has one row per slice', async ({
	page,
}) => {
	const data = await setup(page);
	const slices = liveSessions(data).reduce(
		(sum, s) =>
			sum + splitByDay(s, ZONE, Date.now()).filter((x) => x.day.startsWith('2026-11')).length,
		0,
	);
	await openBuilder(page);
	const [download] = await Promise.all([page.waitForEvent('download'), exportAs(page, 'Excel')]);
	expect(download.suggestedFilename()).toBe('hourtrail-report-2026-11.xlsx');
	const sheets = await readXlsxFile(await readFile((await download.path())!), { trim: false });
	const sessions = sheets.find((sheet) => sheet.sheet === 'Sessions');
	expect(sessions).toBeDefined();
	expect(sessions!.data).toHaveLength(slices + 1);
});

test('Builder screenshots for phone and desktop, light and dark, with presets and an excluded session', async ({
	page,
}, testInfo) => {
	test.skip(testInfo.project.name !== 'chromium' || !process.env.HT_RUN_DIR, 'screenshots only');
	const directory = join(process.env.HT_RUN_DIR!, 'shots');
	await mkdir(directory, { recursive: true });
	await setup(page);
	await seedRecords(page, {
		report_preset: [
			{
				id: newId(),
				rev: 0,
				created_at: Date.now(),
				updated_at: Date.now(),
				updated_by: '',
				deleted_at: null,
				name: 'This month',
				config: { range: { from: '2026-11-01', to: '2026-11-30' }, relative_range: 'this_month' },
			},
		],
	});

	for (const [name, size] of [
		['phone', { width: 390, height: 844 }],
		['desktop', { width: 1280, height: 800 }],
	] as const) {
		for (const theme of ['Light', 'Dark'] as const) {
			await page.setViewportSize(size);
			await page.goto('/settings/appearance');
			await dismissInstallHint(page);
			await page.getByRole('radio', { name: theme }).click();
			// Phones show the options first; the preview is captured on desktop, and on phones
			// the options column is the screen.
			await openBuilder(page, { preview: name === 'desktop' });
			const prefix = `report-builder-${name}-${theme.toLowerCase()}`;
			if (name === 'desktop') await expect(workTotal(page)).toBeVisible();
			await page.screenshot({ path: join(directory, `${prefix}.png`), fullPage: true });

			if (name === 'desktop') {
				await page.getByRole('button', { name: 'Presets' }).click();
				await expect(page.getByRole('menuitem', { name: 'This month' })).toBeVisible();
				await page.screenshot({ path: join(directory, `${prefix}-presets.png`) });
				await page.keyboard.press('Escape');

				await rowWithNote(page, WORK_NOTE).getByRole('checkbox').uncheck();
				await expect(rowWithNote(page, WORK_NOTE).getByText('Excluded')).toBeVisible();
				await page.screenshot({ path: join(directory, `${prefix}-excluded.png`), fullPage: true });
				await rowWithNote(page, WORK_NOTE).getByRole('checkbox').check();
			}
		}
	}
});
