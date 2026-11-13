import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// This key and its hash are test-only. Never use a production or staging key here.
export const TEST_ACCOUNT_KEY = 'HT1-0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TEST_ACCOUNT_KEY_HASH =
	'842a8e7b26b31ce05ebcd481440916e981822e43abb0279a8450b0c8e5b1bfb1';

// The E2E server's local D1 lives outside test-results/ (Playwright clears that directory at the
// start of a run, possibly while wrangler dev is using it). playwright.config.ts uses this path.
export const E2E_D1_DIR = '.wrangler/e2e-d1';

function d1Execute(sql: string): void {
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
			sql,
		],
		{ stdio: 'ignore', timeout: 60_000 },
	);
}

// The lockout is global and persists in D1 for 15 minutes, so a spec that triggers it must clear
// it, or every later sign-in in the same server (repeats, CI retries) gets 429.
export async function resetAuthLockout(): Promise<void> {
	d1Execute("DELETE FROM meta WHERE key = 'auth_lockout'");
}

// Every signed-in spec uses the one test account on the one local D1, and signed-in devices pull
// everything on the account. Running two of them at once, or after leftovers from earlier runs,
// lets them see each other's sessions (a pulled running session even replaces Home's Start
// button). So signed-in tests take this cross-worker lock and start from an empty server.
const CLOUD_LOCK = `${E2E_D1_DIR}.lock`;

export async function acquireCloud(): Promise<void> {
	const deadline = Date.now() + 150_000;
	for (;;) {
		try {
			mkdirSync(resolve(CLOUD_LOCK));
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			try {
				// A lock older than five minutes belongs to a crashed run.
				if (Date.now() - statSync(resolve(CLOUD_LOCK)).mtimeMs > 300_000)
					rmSync(resolve(CLOUD_LOCK), { recursive: true, force: true });
			} catch {
				// Removed by its owner meanwhile.
			}
			if (Date.now() > deadline) throw new Error('Timed out waiting for the cloud E2E lock.');
			await new Promise((done) => setTimeout(done, 500));
		}
	}
	d1Execute(
		'DELETE FROM records; DELETE FROM sync_batches; DELETE FROM link_codes; ' +
			'DELETE FROM push_subscriptions; DELETE FROM reminder_state; DELETE FROM devices; DELETE FROM meta;',
	);
}

export function releaseCloud(): void {
	rmSync(resolve(CLOUD_LOCK), { recursive: true, force: true });
}
