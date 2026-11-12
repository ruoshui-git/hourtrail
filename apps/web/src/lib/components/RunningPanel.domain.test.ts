import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import RunningPanel from './RunningPanel.svelte';

const startAt = new Date(2026, 10, 12, 4, 2).getTime();
const base = {
	typeName: 'Work',
	typeColor: 'lake',
	startAt,
	now: startAt + 8_047_000,
	onstop: () => {},
	onswitch: () => {},
} as const;

describe('RunningPanel', () => {
	it('shows the elapsed time from startAt and the start line', () => {
		render(RunningPanel, { ...base, workItemName: '库存管理系统开发', placeName: '第1寺院' });
		expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('2:14:07');
		expect(screen.getByText('Started 4:02 AM at 第1寺院')).toBeTruthy();
	});

	it('calls onname with trimmed text on Enter', async () => {
		const onname = vi.fn();
		render(RunningPanel, { ...base, workItemName: null, onname });
		const input = screen.getByRole('textbox', { name: 'Name this session' });
		await fireEvent.input(input, { target: { value: '  Sorting the shed  ' } });
		await fireEvent.submit(input.closest('form') as HTMLFormElement);
		expect(onname).toHaveBeenCalledOnce();
		expect(onname).toHaveBeenCalledWith('Sorting the shed');
	});

	it('calls onname on blur with trimmed text', async () => {
		const onname = vi.fn();
		render(RunningPanel, { ...base, workItemName: null, onname });
		const input = screen.getByRole('textbox', { name: 'Name this session' });
		await fireEvent.input(input, { target: { value: 'Shed' } });
		await fireEvent.focusOut(input);
		expect(onname).toHaveBeenCalledWith('Shed');
	});

	it('ignores an empty or blank name', async () => {
		const onname = vi.fn();
		render(RunningPanel, { ...base, workItemName: null, onname });
		const input = screen.getByRole('textbox', { name: 'Name this session' });
		await fireEvent.input(input, { target: { value: '   ' } });
		await fireEvent.submit(input.closest('form') as HTMLFormElement);
		await fireEvent.focusOut(input);
		expect(onname).not.toHaveBeenCalled();
	});

	it('wires Stop and Switch', async () => {
		const onstop = vi.fn();
		const onswitch = vi.fn();
		render(RunningPanel, { ...base, workItemName: 'Shed', onstop, onswitch });
		await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
		expect(onstop).toHaveBeenCalledOnce();
		expect(onswitch).toHaveBeenCalledOnce();
	});
});
