import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const portBase = Number(process.env.HT_PORT_BASE ?? 5170);

export default defineConfig({
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
