import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SyncBadge from './SyncBadge.svelte';

describe('SyncBadge wording', () => {
	it.each([
		[{ state: 'local' }, 'On this device only'],
		[{ state: 'synced' }, 'Backed up'],
		[{ state: 'pending', pendingCount: 3 }, '3 changes waiting'],
		[{ state: 'pending', pendingCount: 1 }, '1 change waiting'],
		[{ state: 'offline', pendingCount: 3 }, 'Offline. 3 changes waiting'],
		[{ state: 'offline', pendingCount: 1 }, 'Offline. 1 change waiting'],
		[{ state: 'offline', pendingCount: 0 }, 'Offline'],
		[{ state: 'error' }, 'Sync problem'],
	] as const)('shows the words for %o', (props, text) => {
		render(SyncBadge, { ...props });
		expect(screen.getByRole('button', { name: text })).toBeTruthy();
	});

	it('calls onclick when tapped', async () => {
		const onclick = vi.fn();
		render(SyncBadge, { state: 'synced', onclick });
		await fireEvent.click(screen.getByRole('button', { name: 'Backed up' }));
		expect(onclick).toHaveBeenCalledOnce();
	});
});
