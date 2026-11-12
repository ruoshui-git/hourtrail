import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkItemRow from './WorkItemRow.svelte';

const props = { name: '修复洗手台', typeColor: 'saffron', typeName: 'Volunteer' } as const;

describe('WorkItemRow gestures', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('starts the item on a tap of the row body', async () => {
		const onstart = vi.fn();
		const onopen = vi.fn();
		render(WorkItemRow, { ...props, onstart, onopen });
		const body = screen.getByRole('button', { name: /^修复洗手台/ });
		await fireEvent.pointerDown(body);
		await fireEvent.pointerUp(body);
		await fireEvent.click(body);
		expect(onstart).toHaveBeenCalledOnce();
		expect(onopen).not.toHaveBeenCalled();
	});

	it('opens details on a long press and does not start for that gesture', async () => {
		const onstart = vi.fn();
		const onopen = vi.fn();
		render(WorkItemRow, { ...props, onstart, onopen });
		const body = screen.getByRole('button', { name: /^修复洗手台/ });
		await fireEvent.pointerDown(body);
		vi.advanceTimersByTime(499);
		expect(onopen).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onopen).toHaveBeenCalledOnce();
		await fireEvent.pointerUp(body);
		await fireEvent.click(body);
		expect(onopen).toHaveBeenCalledOnce();
		expect(onstart).not.toHaveBeenCalled();
	});

	it('does not open details when the press ends before 500 ms', async () => {
		const onopen = vi.fn();
		render(WorkItemRow, { ...props, onstart: vi.fn(), onopen });
		const body = screen.getByRole('button', { name: /^修复洗手台/ });
		await fireEvent.pointerDown(body);
		vi.advanceTimersByTime(200);
		await fireEvent.pointerUp(body);
		vi.advanceTimersByTime(1000);
		expect(onopen).not.toHaveBeenCalled();
	});

	it('opens details from the details button and never starts', async () => {
		const onstart = vi.fn();
		const onopen = vi.fn();
		render(WorkItemRow, { ...props, onstart, onopen });
		await fireEvent.click(screen.getByRole('button', { name: 'Details for 修复洗手台' }));
		expect(onopen).toHaveBeenCalledOnce();
		expect(onstart).not.toHaveBeenCalled();
	});

	it('starts from the Start button without opening details', async () => {
		const onstart = vi.fn();
		const onopen = vi.fn();
		render(WorkItemRow, { ...props, onstart, onopen });
		await fireEvent.click(screen.getByRole('button', { name: 'Start 修复洗手台' }));
		expect(onstart).toHaveBeenCalledOnce();
		expect(onopen).not.toHaveBeenCalled();
	});
});
