import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog.svelte';
import Sheet from './Sheet.svelte';
import ToastRegion from './ToastRegion.svelte';
import { dismissToast, showToast, toasts } from './toasts.svelte';
import { createRawSnippet } from 'svelte';

const body = createRawSnippet(() => ({ render: () => '<p>Session note</p>' }));

// jsdom has no Web Animations, so bits-ui unmounts a closed dialog after a frame.
async function expectDialogGone() {
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

function clearToasts() {
	for (const toast of [...toasts.items]) dismissToast(toast.id);
}

describe('ConfirmDialog', () => {
	it('keeps confirm disabled until the typed text matches exactly', async () => {
		const onconfirm = vi.fn();
		render(ConfirmDialog, {
			open: true,
			title: 'Replace everything?',
			message: 'Your data on this phone is replaced.',
			confirmLabel: 'Replace everything',
			requireText: 'Replace everything',
			danger: true,
			onconfirm,
		});
		const confirm = screen.getByRole('button', { name: 'Replace everything' }) as HTMLButtonElement;
		const input = screen.getByRole('textbox', { name: 'Type Replace everything to confirm' });
		expect(confirm.disabled).toBe(true);

		await fireEvent.input(input, { target: { value: 'Replace' } });
		expect(confirm.disabled).toBe(true);
		await fireEvent.input(input, { target: { value: 'replace everything' } });
		expect(confirm.disabled).toBe(true);
		await fireEvent.input(input, { target: { value: 'Replace everything' } });
		expect(confirm.disabled).toBe(false);

		await fireEvent.click(confirm);
		expect(onconfirm).toHaveBeenCalledOnce();
	});

	it('enables a plain confirm without typed text', async () => {
		const onconfirm = vi.fn();
		render(ConfirmDialog, {
			open: true,
			title: 'Switch to Volunteer?',
			message: 'The running session stops.',
			confirmLabel: 'Switch',
			onconfirm,
		});
		const confirm = screen.getByRole('button', { name: 'Switch' }) as HTMLButtonElement;
		expect(confirm.disabled).toBe(false);
		await fireEvent.click(confirm);
		expect(onconfirm).toHaveBeenCalledOnce();
	});
});

describe('Sheet', () => {
	it('closes on Escape and calls onclose', async () => {
		const onclose = vi.fn();
		render(Sheet, { open: true, title: 'Edit session', onclose, children: body });
		expect(screen.getByRole('dialog', { name: 'Edit session' })).toBeTruthy();
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		expect(onclose).toHaveBeenCalledOnce();
		await expectDialogGone();
	});

	it('closes from the close button and calls onclose', async () => {
		const onclose = vi.fn();
		render(Sheet, { open: true, title: 'Edit session', onclose, children: body });
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onclose).toHaveBeenCalledOnce();
		await expectDialogGone();
	});
});

describe('toast store', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		clearToasts();
		vi.useRealTimers();
	});

	it('dismisses after six seconds by default', () => {
		showToast({ message: 'Session deleted.' });
		vi.advanceTimersByTime(5999);
		expect(toasts.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toasts.items).toHaveLength(0);
	});

	it('pauses while hovered and resumes the remaining time', async () => {
		render(ToastRegion);
		const id = showToast({ message: 'Session deleted.' });
		await tick();
		vi.advanceTimersByTime(3000);
		const toast = screen.getByText('Session deleted.').closest('.toast') as HTMLElement;
		await fireEvent.pointerEnter(toast);
		vi.advanceTimersByTime(60_000);
		expect(toasts.items.map((t) => t.id)).toContain(id);
		await fireEvent.pointerLeave(toast);
		vi.advanceTimersByTime(2999);
		expect(toasts.items.map((t) => t.id)).toContain(id);
		vi.advanceTimersByTime(1);
		expect(toasts.items.map((t) => t.id)).not.toContain(id);
	});

	it('calls undo exactly once and dismisses the toast', async () => {
		const undo = vi.fn();
		render(ToastRegion);
		showToast({ message: 'Session deleted.', undo });
		await tick();
		const button = screen.getByRole('button', { name: 'Undo' });
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(undo).toHaveBeenCalledOnce();
		expect(toasts.items).toHaveLength(0);
	});
});
