import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './apps/web/svelte.config.js';

export default ts.config(
	{
		ignores: [
			'**/node_modules/',
			'**/.svelte-kit/',
			'**/build/',
			'**/dist/',
			'**/.wrangler/',
			'.worktrees/',
			'.agent-runs/',
			'test-results/',
			'playwright-report/',
		],
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			'@typescript-eslint/consistent-type-imports': 'error',
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig,
			},
		},
	},
	{
		// Fixed dates in tests need an explicit offset: CI runs in UTC and the browser in New York.
		files: ['e2e/**/*.ts', '**/*.test.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"NewExpression[callee.name='Date'] > Literal[value=/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$/]",
					message: 'Give fixed test dates an explicit UTC offset (for example -05:00 or Z).',
				},
			],
		},
	},
	{
		// core stays pure: no browser or Worker globals.
		files: ['packages/core/src/**/*.ts'],
		languageOptions: { globals: {} },
		rules: {
			'no-restricted-globals': [
				'error',
				'window',
				'document',
				'navigator',
				'indexedDB',
				'localStorage',
				'fetch',
				'caches',
			],
		},
	},
);
