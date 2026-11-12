import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const portBase = Number(process.env.HT_PORT_BASE ?? 5170);

export default defineConfig({
	plugins: [sveltekit()],
	server: { port: portBase, strictPort: true },
	preview: { port: portBase + 1, strictPort: true },
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
