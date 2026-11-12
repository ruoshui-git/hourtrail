// Routes captured by `pnpm shots` (phone and desktop, light and dark).
// Gallery overlays open on load with ?open=<id>.
export const SHOT_ROUTES: { name: string; path: string }[] = [
	{ name: 'home', path: '/' },
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
