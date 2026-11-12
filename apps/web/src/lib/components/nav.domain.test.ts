import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Sidebar from './Sidebar.svelte';
import TabBar from './TabBar.svelte';
import { DESTINATIONS } from './nav';

describe('navigation', () => {
	it('lists the five destinations in order', () => {
		expect(DESTINATIONS.map((d) => [d.label, d.href])).toEqual([
			['Home', '/'],
			['History', '/history'],
			['Items', '/items'],
			['Reports', '/reports'],
			['Settings', '/settings'],
		]);
	});

	it.each([TabBar, Sidebar])(
		'marks only the current destination with aria-current',
		(component) => {
			render(component, { current: 'history' });
			const links = screen.getAllByRole('link');
			expect(links).toHaveLength(5);
			const current = links.filter((link) => link.getAttribute('aria-current') === 'page');
			expect(current.map((link) => link.textContent?.trim())).toEqual(['History']);
		},
	);
});
