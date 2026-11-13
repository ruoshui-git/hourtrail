import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$lib/db/app', () => ({
	db: {
		local: { get: vi.fn(async () => undefined), put: vi.fn() },
		setting: { get: vi.fn(async () => undefined) },
	},
	prepareLocalData: vi.fn(),
}));
vi.mock('$lib/live.svelte', () => ({
	live: () => ({ current: { last: null, tz: 'UTC' }, error: undefined }),
}));
vi.mock('$lib/features/cloud/auth.svelte', () => ({ auth: { status: 'signed-in' } }));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Settings backup nightly status', () => {
	it('shows the last nightly backup date', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					last_nightly_at: Date.UTC(2026, 10, 13, 7, 17),
					dump: 'hourtrail-2026-11-13.sql.age',
				}),
			),
		);
		render(Page);
		await waitFor(() => expect(screen.getByText(/Last nightly backup:/)).toBeTruthy());
		expect(screen.getByText(/Nov 13, 2026/)).toBeTruthy();
	});

	it('shows when no nightly backup exists', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ last_nightly_at: null, dump: null })),
		);
		render(Page);
		await waitFor(() => expect(screen.getByText('No nightly backup yet')).toBeTruthy());
	});

	it('cautions when the last nightly backup is older than 48 hours', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ last_nightly_at: Date.now() - 49 * 60 * 60 * 1000, dump: 'old.sql.age' }),
			),
		);
		render(Page);
		await waitFor(() =>
			expect(screen.getByText('The last nightly backup is more than 2 days old.')).toBeTruthy(),
		);
	});
});
