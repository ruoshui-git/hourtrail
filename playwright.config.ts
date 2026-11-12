import { defineConfig, devices } from '@playwright/test';

// E2E runs against `wrangler dev` serving the built app, like production.
// Ports come from HT_PORT_BASE so parallel task worktrees do not collide.
const port = Number(process.env.HT_PORT_BASE ?? 5170) + 2;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: 'e2e',
	testIgnore: ['shots.spec.ts'],
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : 2,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	// Pin zone and locale: seeds and fixed clocks assume New York, and CI runs in UTC.
	use: { baseURL, trace: 'retain-on-failure', timezoneId: 'America/New_York', locale: 'en-US' },
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'webkit-iphone', use: { ...devices['iPhone 15'] } },
	],
	webServer: {
		command: `pnpm build && pnpm --filter @hourtrail/worker exec wrangler dev --port ${port} --ip 127.0.0.1`,
		url: `${baseURL}/api/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'ignore',
		stderr: 'pipe',
	},
});
