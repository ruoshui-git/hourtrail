// Routes captured by `pnpm shots` (phone and desktop, light and dark).
// Gallery overlays open on load with ?open=<id>. `seed` resets the local database
// to a scenario from apps/web/src/lib/dev/seed.ts first; the clock is fixed at
// 2026-11-12 10:30 America/New_York.
export type ShotRoute = {
	name: string;
	path: string;
	seed?: 'empty' | 'idle' | 'running' | 'untitled';
};

export const SHOT_ROUTES: ShotRoute[] = [
	{ name: 'home-empty', path: '/', seed: 'empty' },
	{ name: 'home-idle', path: '/', seed: 'idle' },
	{ name: 'home-running', path: '/', seed: 'running' },
	{ name: 'home-untitled', path: '/', seed: 'untitled' },
	{ name: 'items', path: '/items', seed: 'idle' },
	{ name: 'history', path: '/history' },
	{ name: 'items', path: '/items' },
	{ name: 'reports', path: '/reports' },
	{ name: 'settings', path: '/settings' },
	{ name: 'gallery', path: '/dev/gallery' },
	{ name: 'gallery-sheet', path: '/dev/gallery?open=sheet' },
	{ name: 'gallery-confirm-danger', path: '/dev/gallery?open=confirm-danger' },
	{ name: 'gallery-confirm-typed', path: '/dev/gallery?open=confirm-typed' },
	{ name: 'gallery-menu', path: '/dev/gallery?open=menu' },
	{ name: 'settings-types', path: '/settings/types' },
	{ name: 'settings-appearance', path: '/settings/appearance' },
];
