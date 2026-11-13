import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test';
import type { Env as WorkerEnv } from '../src/env';

declare global {
	// Cloudflare's test bindings are typed through this global namespace.
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Cloudflare {
		interface Env extends WorkerEnv {
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
