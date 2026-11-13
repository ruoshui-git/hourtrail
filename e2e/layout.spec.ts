import { expect, test } from '@playwright/test';

const destinations = [
	{ name: 'home', path: '/' },
	{ name: 'items', path: '/items', width: 720 },
	{ name: 'history', path: '/history' },
	{ name: 'reports', path: '/reports', width: 720 },
	{ name: 'settings', path: '/settings', width: 720 },
	{ name: 'activity types', path: '/settings/types', width: 720 },
	{ name: 'places', path: '/settings/places', width: 720 },
	{ name: 'backup', path: '/settings/backup', width: 720 },
	{ name: 'appearance', path: '/settings/appearance', width: 720 },
	{ name: 'privacy', path: '/settings/privacy', width: 720 },
	{ name: 'daily review', path: '/history/review?day=2026-11-11', width: 720 },
];

for (const destination of destinations) {
	test(`${destination.name} layout`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.clock.setFixedTime(new Date('2026-11-12T10:30:00-05:00'));
		await page.goto('/dev/seed?scenario=idle');
		await expect(page.locator('[data-seed-status]')).toHaveText('Seeded idle');
		await page.goto(destination.path);
		await expect(page.locator('main h1').first()).toBeVisible();

		if (destination.name === 'items' && testInfo.project.name === 'chromium') {
			await page
				.getByRole('button', { name: 'Details for 库存管理系统开发' })
				.click({ force: true });
			await expect(page.locator('main h1')).toHaveText('库存管理系统开发');
		}

		if (destination.width) {
			const contentWidth = await page.locator('main').evaluate(
				(main, selector) => {
					const target = main.querySelector(selector as string);
					return target?.getBoundingClientRect().width ?? null;
				},
				destination.name === 'items'
					? 'header'
					: destination.name === 'settings'
						? 'nav'
						: 'main > *',
			);
			expect(contentWidth, `${destination.name} content width`).not.toBeNull();
			expect(contentWidth!).toBeLessThanOrEqual(destination.width);
		}

		const heading = page.locator('main h1').first();
		const header = heading.locator('xpath=ancestor::header[1]');
		if (await header.count()) {
			const actions = header.locator('button, a[role="button"]');
			if (await actions.count()) {
				const titleBox = await heading.boundingBox();
				const actionBox = await actions.first().boundingBox();
				if (titleBox && actionBox) expect(Math.abs(titleBox.y - actionBox.y)).toBeLessThan(20);
			}
		}

		if (destination.name === 'history' && testInfo.project.name === 'chromium') {
			await expect(page.locator('.skip-editor')).toHaveAttribute('href', '#history-editor');
			const controlHeights = await page
				.locator('.presets button, .filters > button')
				.evaluateAll((items) =>
					items.map((item) => Math.round(item.getBoundingClientRect().height)),
				);
			expect(controlHeights.length).toBeGreaterThan(3);
			expect(controlHeights.every((height) => height === 48)).toBe(true);
			await page.getByLabel('Search sessions').fill('权限开发');
			await expect(page.locator('.results-table tbody button').first()).toHaveText(
				/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/,
			);
			const skipEditor = page.locator('.skip-editor');
			await skipEditor.focus();
			await expect(skipEditor).toBeVisible();
			await expect(page.locator('#history-editor')).toHaveAttribute('tabindex', '-1');
		}

		const widths = testInfo.project.name === 'chromium' ? [390, 1280] : [390];
		for (const width of widths) {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
			await expect.poll(() => page.evaluate(() => document.body.scrollWidth)).toBe(width);
		}
	});
}
