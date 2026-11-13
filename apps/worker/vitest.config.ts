import { fileURLToPath, URL } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { TEST_ACCOUNT_KEY_HASH } from './test/auth-key';

// Worker tests run inside workerd with the bindings from wrangler.jsonc (local D1).
export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				bindings: {
					ACCOUNT_KEY_HASH: TEST_ACCOUNT_KEY_HASH,
					TEST_MIGRATIONS: await readD1Migrations(
						fileURLToPath(new URL('./migrations', import.meta.url)),
					),
				},
			},
		}),
	],
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		setupFiles: ['./test/apply-migrations.ts'],
	},
});
