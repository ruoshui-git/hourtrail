import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { SHOT_ROUTES } from './shots.routes';

const directory =
	process.env.HT_SHOTS_DIR ??
	(process.env.HT_RUN_DIR ? `${process.env.HT_RUN_DIR}/shots` : 'shots');

for (const route of SHOT_ROUTES) {
	test(route.name, async ({ page }, testInfo) => {
		// A fixed clock makes elapsed times, today's ribbon and dates repeatable.
		await page.clock.setFixedTime(new Date('2026-11-12T10:30:00-05:00'));
		if (route.seed) {
			await page.goto(`/dev/seed?scenario=${route.seed}`);
			await expect(page.locator('[data-seed-status]')).toHaveText(`Seeded ${route.seed}`);
		}
		await page.goto(route.path);
		await expect(page.locator('main h1')).toBeVisible();
		// SvelteKit's SPA fallback mounts asynchronously. A usable control proves hydration.
		if (route.name === 'gallery') {
			await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
			await expect(page.getByRole('heading', { name: 'Choices', exact: true })).toBeVisible();
			await expect(page.getByLabel('Work item', { exact: true })).toHaveValue('库存管理系统开发');
		}
		await page.evaluate(() => document.fonts.ready);
		if (route.name === 'gallery') {
			await page.getByRole('radio', { name: 'Dark', exact: true }).click();
			await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
			await page.getByRole('radio', { name: 'Light', exact: true }).click();
			await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
			await page.getByRole('radio', { name: 'System', exact: true }).click();
			await expect(page.locator('html')).not.toHaveAttribute('data-theme');

			const input = page.getByRole('textbox', { name: 'Work item', exact: true });
			expect((await input.boundingBox())?.height).toBe(48);
			// Every single-line control is 48 px, whichever column or state it is in.
			const heights = await page
				.locator('main input:not([type=checkbox]):not([type=radio]), main select')
				.evaluateAll((els) =>
					els.map((el) => ({
						label: el.id || el.getAttribute('aria-label') || el.outerHTML.slice(0, 60),
						height: Math.round(el.getBoundingClientRect().height),
					})),
				);
			expect(heights.length).toBeGreaterThan(5);
			expect(heights.filter((h) => h.height !== 48)).toEqual([]);
			expect(
				(await page.getByRole('button', { name: 'Start', exact: true }).boundingBox())?.height,
			).toBe(60);
			const note = page.getByRole('textbox', { name: 'Note', exact: true });
			const original = await note.inputValue();
			const initialHeight = (await note.boundingBox())!.height;
			await note.fill(Array(12).fill('库存管理系统开发 at 第1寺院').join('\n'));
			await expect
				.poll(async () => (await note.boundingBox())!.height)
				.toBeGreaterThan(initialHeight);
			await note.fill(original);
			await expect.poll(async () => (await note.boundingBox())!.height).toBe(initialHeight);
		}

		await expect(page.locator('main')).not.toBeEmpty();
		await expect(page.locator('body')).toHaveJSProperty(
			'scrollWidth',
			await page.evaluate(() => window.innerWidth),
		);
		const overlay = route.path.includes('?open=');
		if (overlay) {
			// Overlays are captured in the viewport, with the open overlay in view.
			const open = page.locator('[role="dialog"], [role="alertdialog"], [role="menu"]').first();
			await expect(open).toBeVisible();
			await open.scrollIntoViewIfNeeded();
		}
		await mkdir(directory, { recursive: true });
		if (route.name === 'gallery') {
			// The whole gallery is taller than the 32767 px screenshot limit at 2x, so
			// capture one image per section (named after its heading order).
			const sections = page.locator('main > section');
			const count = await sections.count();
			expect(count).toBeGreaterThan(5);
			for (let i = 0; i < count; i++) {
				await sections.nth(i).screenshot({
					path: join(
						directory,
						`${route.name}-${String(i + 1).padStart(2, '0')}-${testInfo.project.name}.png`,
					),
					animations: 'disabled',
				});
			}
			return;
		}
		await page.screenshot({
			path: join(directory, `${route.name}-${testInfo.project.name}.png`),
			fullPage: !overlay,
			animations: 'disabled',
		});
	});
}
