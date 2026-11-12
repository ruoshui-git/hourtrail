import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import TrailList from './TrailList.svelte';
import type { TrailRow } from './trail';

const rows: TrailRow[] = [
	{
		kind: 'session',
		id: 'a',
		startLabel: '9:00 AM',
		endLabel: '10:00 AM',
		name: '库存管理系统开发',
		typeName: 'Work',
		typeColor: 'lake',
		placeName: '第1寺院',
		note: '修复洗手台\nsecond line',
		durationLabel: '1h 00m',
		pending: true,
	},
	{
		kind: 'gap',
		id: 'g',
		start: 1_000,
		end: 5_400_000,
		rangeLabel: '10:00 AM to 11:30 AM',
		durationLabel: '1h 30m',
	},
	{
		kind: 'session',
		id: 'b',
		startLabel: '11:30 PM',
		endLabel: null,
		name: null,
		typeName: 'Overhead',
		typeColor: 'rose',
		durationLabel: '30m',
		continuesNextDay: true,
		running: true,
	},
	{
		kind: 'session',
		id: 'c',
		startLabel: '12:00 AM',
		endLabel: '1:00 AM',
		name: 'Night',
		typeName: 'Volunteer',
		typeColor: 'fern',
		durationLabel: '1h 00m',
		continuesFromPreviousDay: true,
	},
];

describe('TrailList', () => {
	it('shows sessions and gaps in the given order', () => {
		render(TrailList, { rows });
		const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
		expect(items[0]).toContain('库存管理系统开发');
		expect(items[1]).toContain('1h 30m not recorded');
		expect(items[2]).toContain('Untitled session');
		expect(items[3]).toContain('Night');
	});

	it('names the work at the place and shows the first line of the note', () => {
		render(TrailList, { rows });
		expect(screen.getByText('Work at 第1寺院')).toBeTruthy();
		expect(screen.getByText('修复洗手台')).toBeTruthy();
		expect(screen.queryByText('second line')).toBeNull();
	});

	it('marks the pending dot and midnight-crossing sessions', () => {
		render(TrailList, { rows });
		expect(screen.getByRole('img', { name: 'Not backed up yet' })).toBeTruthy();
		expect(screen.getByText('Continues tomorrow')).toBeTruthy();
		expect(screen.getByText('Continued from yesterday')).toBeTruthy();
	});

	it('calls onaddgap with the gap bounds', async () => {
		const onaddgap = vi.fn();
		const { container } = render(TrailList, { rows, onaddgap });
		const gap = container.querySelector('.gap') as HTMLElement;
		await fireEvent.click(within(gap).getByRole('button', { name: 'Add' }));
		expect(onaddgap).toHaveBeenCalledOnce();
		expect(onaddgap).toHaveBeenCalledWith({ start: 1_000, end: 5_400_000 });
	});

	it('calls onselect with the session id', async () => {
		const onselect = vi.fn();
		render(TrailList, { rows, onselect });
		await fireEvent.click(screen.getByRole('button', { name: /Untitled session/ }));
		expect(onselect).toHaveBeenCalledWith('b');
	});
});
