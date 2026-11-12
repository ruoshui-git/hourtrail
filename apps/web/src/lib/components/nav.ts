import type { Component } from 'svelte';
import { ChartColumn, History, House, ListChecks, Settings } from '@lucide/svelte';

export type Destination = 'home' | 'history' | 'items' | 'reports' | 'settings';

export type DestinationHref = '/' | '/history' | '/items' | '/reports' | '/settings';

export const DESTINATIONS: readonly { id: Destination; label: string; href: DestinationHref }[] = [
	{ id: 'home', label: 'Home', href: '/' },
	{ id: 'history', label: 'History', href: '/history' },
	{ id: 'items', label: 'Items', href: '/items' },
	{ id: 'reports', label: 'Reports', href: '/reports' },
	{ id: 'settings', label: 'Settings', href: '/settings' },
];

/** One icon per destination; TabBar and Sidebar share this map so they stay consistent. */
export const DESTINATION_ICONS: Record<Destination, Component> = {
	home: House,
	history: History,
	items: ListChecks,
	reports: ChartColumn,
	settings: Settings,
};
