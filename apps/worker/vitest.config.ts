import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Worker tests run inside workerd with the bindings from wrangler.jsonc (local D1).
export default defineConfig({
	plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
	},
});
