import { expect, test } from '@playwright/test';
import { seed } from './helpers/acceptance';

test.use({ actionTimeout: 15_000 });
test.use({ viewport: { width: 390, height: 844 } });
test.skip(
	({ browserName }) => browserName !== 'chromium',
	'Keyboard focus coverage runs in Chromium.',
);

test('primary screens and settings controls are reachable by keyboard with visible focus', async ({
	page,
}) => {
	await page.clock.install({ time: new Date('2026-11-12T12:00:00-05:00') });
	await seed(page, 'idle');
	const paths = [
		'/',
		'/history',
		'/reports',
		'/reports/new',
		'/settings',
		'/settings/types',
		'/settings/places',
		'/settings/reminders',
		'/settings/cloud',
		'/settings/privacy',
		'/settings/backup',
		'/settings/appearance',
	];

	for (const path of paths) {
		await page.goto(path);
		await expect(page.locator('main'), `${path} should render its main content`).not.toBeEmpty();
		const actions = page.locator(
			'main button:visible, main a:visible, main input:visible, main select:visible',
		);
		const count = await actions.count();
		expect(count, `${path} should have a keyboard action`).toBeGreaterThan(0);
		let reached = 0;
		for (let tab = 0; tab < Math.min(count + 12, 40); tab++) {
			await page.keyboard.press('Tab');
			const state = await page.evaluate(() => {
				const element = document.activeElement;
				if (!(element instanceof HTMLElement)) return { inside: false, visible: false, target: '' };
				const style = getComputedStyle(element);
				const nativeDateField =
					element instanceof HTMLInputElement && element.type === 'datetime-local';
				return {
					inside: element !== document.body,
					visible:
						(style.outlineStyle !== 'none' && style.outlineWidth !== '0px') || nativeDateField,
					target: `${element.tagName}.${element.className}#${element.id} ${element.outerHTML.slice(0, 120)} outline=${style.outlineStyle}/${style.outlineWidth}`,
				};
			});
			if (!state.inside) break;
			reached++;
			expect(
				state.visible,
				`${path} tab ${tab + 1} ${state.target} should have visible focus`,
			).toBe(true);
		}
		expect(reached, `${path} should expose keyboard-focusable actions`).toBeGreaterThan(0);
	}

	await page.goto('/history');
	const sessionRow = page.locator('button.session').first();
	await sessionRow.click();
	const editor = page.getByRole('dialog', { name: 'Edit session' });
	await expect(editor).toBeVisible();
	await expect
		.poll(() => editor.evaluate((dialog) => dialog.contains(document.activeElement)))
		.toBe(true);
	const sheetControls = editor.locator(
		'button:visible, input:visible, textarea:visible, select:visible',
	);
	for (let tab = 0; tab < (await sheetControls.count()) + 1; tab++) {
		await page.keyboard.press('Tab');
		await expect
			.poll(() => editor.evaluate((dialog) => dialog.contains(document.activeElement)))
			.toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(editor).toHaveCount(0);
	await expect(sessionRow).toBeFocused();

	await sessionRow.click();
	const reopenedEditor = page.getByRole('dialog', { name: 'Edit session' });
	await reopenedEditor.getByRole('button', { name: 'Delete session' }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete this session?' });
	await expect(confirm).toBeVisible();
	await expect
		.poll(() => confirm.evaluate((dialog) => dialog.contains(document.activeElement)))
		.toBe(true);
	const dialogControls = confirm.locator('button:visible, input:visible');
	for (let tab = 0; tab < (await dialogControls.count()) + 1; tab++) {
		await page.keyboard.press('Tab');
		await expect
			.poll(() => confirm.evaluate((dialog) => dialog.contains(document.activeElement)))
			.toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(confirm).toHaveCount(0);
	await expect(reopenedEditor.getByRole('button', { name: 'Delete session' })).toBeFocused();
});
