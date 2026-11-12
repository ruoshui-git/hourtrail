import { expect, test } from '@playwright/test';

test('the shell and deep links work offline while API requests fail', async ({ page, context }) => {
	await page.goto('/');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) {
			await new Promise<void>((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
					once: true,
				}),
			);
		}
	});
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
	await page.goto('/history');
	await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
	const apiFailed = await page.evaluate(async () => {
		try {
			await fetch('/api/health');
			return false;
		} catch {
			return true;
		}
	});
	expect(apiFailed).toBe(true);
});
