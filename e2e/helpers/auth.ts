// This key and its hash are test-only. Never use a production or staging key here.
export const TEST_ACCOUNT_KEY = 'HT1-0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TEST_ACCOUNT_KEY_HASH =
	'842a8e7b26b31ce05ebcd481440916e981822e43abb0279a8450b0c8e5b1bfb1';

// The E2E server's local D1 lives outside test-results/ (Playwright clears that directory at the
// start of a run, possibly while wrangler dev is using it). playwright.config.ts uses this path.
export const E2E_D1_DIR = '.wrangler/e2e-d1';

// The lockout is global and persists in D1 for 15 minutes, so a spec that triggers it must clear
// it, or every later sign-in in the same server (repeats, CI retries) gets 429.
export async function resetAuthLockout(): Promise<void> {
	const { execFileSync } = await import('node:child_process');
	const { resolve } = await import('node:path');
	execFileSync(
		'pnpm',
		[
			'--filter',
			'@hourtrail/worker',
			'exec',
			'wrangler',
			'd1',
			'execute',
			'DB',
			'--local',
			'--persist-to',
			resolve(E2E_D1_DIR),
			'--command',
			"DELETE FROM meta WHERE key = 'auth_lockout'",
		],
		{ stdio: 'ignore', timeout: 60_000 },
	);
}
