import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoDir = fileURLToPath(new URL('../../', import.meta.url));
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
	.version as string;
let commit = 'dev';
try {
	commit =
		execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
			cwd: repoDir,
			encoding: 'utf8',
		}).trim() || 'dev';
} catch {
	// Keep the initialized fallback when git metadata is unavailable.
}

const portBase = Number(process.env.HT_PORT_BASE ?? 5170);

export default defineConfig({
	define: {
		__HT_VERSION__: JSON.stringify(version),
		__HT_COMMIT__: JSON.stringify(commit),
		__HT_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
	},
	plugins: [sveltekit()],
	server: { port: portBase, strictPort: true },
	preview: { port: portBase + 1, strictPort: true },
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					include: ['src/**/*.test.ts'],
					exclude: [
						'src/**/*.svelte.test.ts',
						'src/lib/components/**/*.test.ts',
						'src/lib/theme.test.ts',
					],
					environment: 'node',
				},
			},
			{
				extends: true,
				resolve: { conditions: ['browser'] },
				test: {
					name: 'components',
					include: [
						'src/**/*.svelte.test.ts',
						'src/lib/components/**/*.test.ts',
						'src/lib/theme.test.ts',
					],
					environment: 'jsdom',
					setupFiles: ['./src/vitest-setup.ts'],
				},
			},
		],
	},
});
