import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test.use({ actionTimeout: 15_000 });

async function records(page: Page, store: 'project' | 'work_item') {
	return page.evaluate(
		(name) =>
			new Promise<Record<string, unknown>[]>((resolve, reject) => {
				const open = indexedDB.open('hourtrail');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const request = db.transaction(name).objectStore(name).getAll();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						db.close();
						resolve(request.result);
					};
				};
			}),
		store,
	);
}

async function createProject(page: Page, name: string) {
	await page.locator('header').getByRole('button', { name: 'New project' }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create project' }).click();
	await expect
		.poll(async () => (await records(page, 'project')).some((row) => row.name === name))
		.toBe(true);
	await expect(page.getByRole('dialog', { name: 'New project' })).toBeHidden();
}

async function createUnassignedItem(page: Page, name: string) {
	await page.goto('/items');
	await page.locator('header').getByRole('button', { name: 'Add work item' }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Add work item' }).last().click();
	await expect
		.poll(async () => (await records(page, 'work_item')).some((row) => row.name === name))
		.toBe(true);
	await expect(page.getByRole('dialog', { name: 'Add work item' })).toBeHidden();
}

async function dismissInstallHint(page: Page) {
	const hint = page.getByRole('dialog', { name: 'Add Hourtrail to your Home Screen' });
	await hint
		.getByRole('button', { name: 'Not now' })
		.click({ timeout: 4000 })
		.catch(() => {});
}

test('projects can be renamed, filled, moved, archived, restored, and deleted when empty', async ({
	page,
}) => {
	await page.goto('/items/projects');
	await dismissInstallHint(page);
	await createProject(page, '第1寺院');
	await createUnassignedItem(page, '库存管理系统开发');

	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: '第1寺院' }).click();
	await expect(page.getByRole('heading', { name: '第1寺院' })).toBeVisible();
	await page.getByRole('button', { name: 'Add items' }).click();
	await page.getByLabel('库存管理系统开发').check();
	await page.getByRole('button', { name: 'Add selected items' }).click();
	await expect(page.getByText('1 work item added.', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
	await expect(
		page.getByText('Move its work items to another project first, or archive the project instead.'),
	).toBeVisible();
	const projectId = (await records(page, 'project')).find((row) => row.name === '第1寺院')!
		.id as string;
	await expect
		.poll(
			async () =>
				(await records(page, 'work_item')).find((row) => row.name === '库存管理系统开发')
					?.project_id,
		)
		.toBe(projectId);
	await page.getByRole('button', { name: 'Move to…' }).click();
	await page.getByLabel('Move to').selectOption('');
	await page.getByRole('button', { name: 'Move work item' }).click();
	await expect(page.getByText('Work item moved.', { exact: true })).toBeVisible();
	await expect
		.poll(
			async () =>
				(await records(page, 'work_item')).find((row) => row.name === '库存管理系统开发')
					?.project_id,
		)
		.toBe(null);

	await page
		.getByRole('button', { name: 'Move to…' })
		.count()
		.then((count) => expect(count).toBe(0));
	await page.goto('/items');
	await expect(page.getByRole('heading', { name: 'No project' })).toBeVisible();
	await page.getByRole('button', { name: 'Details for 库存管理系统开发' }).click();
	await page.getByLabel('Project').selectOption(projectId);
	await page.getByLabel('Description').click();
	await expect
		.poll(
			async () =>
				(await records(page, 'work_item')).find((row) => row.name === '库存管理系统开发')
					?.project_id,
		)
		.toBe(projectId);

	await page.goto('/items');
	await page.getByRole('button', { name: 'Options for 第1寺院' }).click();
	await page.getByRole('menuitem', { name: 'Rename project' }).click();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Temple renamed');
	await page.getByRole('button', { name: 'Save name' }).click();
	await expect(page.getByRole('heading', { name: 'Temple renamed' })).toBeVisible();
	await expect(page.getByText('Project renamed.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Options for Temple renamed' }).click();
	await page.getByRole('menuitem', { name: 'Open project' }).click();
	await expect(page).toHaveURL(new RegExp(`/items/projects/${projectId}$`));
	await page.getByRole('button', { name: 'Archive' }).click();
	await expect(page.getByRole('heading', { name: 'Archive Temple renamed?' })).toBeVisible();
	await page.getByRole('button', { name: 'Archive project' }).click();
	await expect(page.getByText('Project archived.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Unarchive', exact: true }).click();
	await page.getByRole('button', { name: 'Unarchive project' }).click();
	await expect(page.getByText('Project unarchived.', { exact: true })).toBeVisible();
	await expect
		.poll(
			async () => (await records(page, 'project')).find((row) => row.id === projectId)?.archived_at,
		)
		.toBe(null);

	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('寺院管理');
	await page.getByRole('button', { name: 'Save name' }).click();
	await expect(page.getByRole('heading', { name: '寺院管理' })).toBeVisible();
	await page.getByRole('button', { name: 'Archive' }).click();
	await page.getByRole('button', { name: 'Archive project' }).click();
	await page.getByRole('button', { name: 'Details for 库存管理系统开发' }).click();
	await expect(page.getByLabel('Project')).toContainText('寺院管理 (archived)');

	await page.goto(`/items/projects/${projectId}`);
	await page.getByRole('button', { name: 'Move to…' }).click();
	await page.getByLabel('Move to').selectOption('');
	await page.getByRole('button', { name: 'Move work item' }).click();
	await expect
		.poll(
			async () =>
				(await records(page, 'work_item')).find((row) => row.name === '库存管理系统开发')
					?.project_id,
		)
		.toBe(null);
	await expect(page.getByRole('button', { name: 'Delete' })).toBeEnabled();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Delete project' }).click();
	await expect
		.poll(
			async () => (await records(page, 'project')).find((row) => row.id === projectId)?.deleted_at,
		)
		.not.toBe(null);
});

test('project screenshots for phone and desktop in light and dark themes', async ({
	page,
}, info) => {
	test.skip(info.project.name !== 'chromium' || !process.env.HT_RUN_DIR, 'screenshots only');
	await page.goto('/items/projects');
	await dismissInstallHint(page);
	await createProject(page, '第1寺院');
	await createProject(page, 'Archived temple');
	await createUnassignedItem(page, '库存管理系统开发');
	await createUnassignedItem(page, '修复洗手台');
	const archivedId = (await records(page, 'project')).find((row) => row.name === 'Archived temple')!
		.id as string;
	await page.goto(`/items/projects/${archivedId}`);
	await page.getByRole('button', { name: 'Archive' }).click();
	await page.getByRole('button', { name: 'Archive project' }).click();
	await page.goto('/items/projects');
	const activeId = (await records(page, 'project')).find((row) => row.name === '第1寺院')!
		.id as string;
	await page.goto(`/items/projects/${activeId}`);
	await page.getByRole('button', { name: 'Add items' }).click();
	await page.getByLabel('库存管理系统开发').check();
	await page.getByRole('button', { name: 'Add selected items' }).click();
	await page.goto('/items/projects');
	const directory = join(process.env.HT_RUN_DIR!, 'shots');
	await mkdir(directory, { recursive: true });
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 1280, height: 800 },
	]) {
		await page.setViewportSize(viewport);
		for (const theme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme: theme });
			const suffix = `${viewport.width}-${theme}`;
			await page.goto('/items/projects');
			await page.screenshot({
				path: join(directory, `projects-list-${suffix}.png`),
				fullPage: true,
			});
			const projectId = activeId;
			await page.goto(`/items/projects/${projectId}`);
			await page.screenshot({
				path: join(directory, `project-page-${suffix}.png`),
				fullPage: true,
			});
			await page.getByRole('button', { name: 'Rename' }).click();
			await page.screenshot({
				path: join(directory, `project-rename-${suffix}.png`),
				fullPage: true,
			});
			await page.getByRole('button', { name: 'Close' }).click();
			await page.getByRole('button', { name: 'Move to…' }).click();
			await page.screenshot({
				path: join(directory, `project-move-${suffix}.png`),
				fullPage: true,
			});
		}
	}
});
