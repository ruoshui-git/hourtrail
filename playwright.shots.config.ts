import { defineConfig } from '@playwright/test';

const port = Number(process.env.HT_PORT_BASE ?? 5170) + 1;

export default defineConfig({
	testDir: './e2e',
	testMatch: 'shots.spec.ts',
	fullyParallel: true,
	workers: 2,
	use: { baseURL: `http://localhost:${port}`, timezoneId: 'America/New_York', locale: 'en-US' },
	projects: ['light', 'dark'].flatMap((colorScheme) => [
		{
			name: `phone-${colorScheme}`,
			use: {
				browserName: 'webkit' as const,
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true,
				deviceScaleFactor: 2,
				colorScheme: colorScheme as 'light' | 'dark',
			},
		},
		{
			name: `desktop-${colorScheme}`,
			use: {
				browserName: 'chromium' as const,
				viewport: { width: 1280, height: 800 },
				colorScheme: colorScheme as 'light' | 'dark',
			},
		},
	]),
	webServer: {
		command:
			'pnpm --filter @hourtrail/web build && pnpm --filter @hourtrail/web preview --host localhost',
		url: `http://localhost:${port}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
