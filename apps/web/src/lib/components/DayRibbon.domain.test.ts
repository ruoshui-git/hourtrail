import { render, fireEvent, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DayRibbon from './DayRibbon.svelte';

const HOUR = 3_600_000;
const ticks = [{ at: 0, label: '12a' }];

function percent(value: string): number {
	return Number.parseFloat(value);
}

describe('DayRibbon', () => {
	it('positions segments proportionally in a 23-hour day', () => {
		render(DayRibbon, {
			dayStart: 0,
			dayEnd: 23 * HOUR,
			segments: [
				{ id: 'w', start: 0, end: HOUR, color: 'lake', label: 'Work, 12:00 AM to 1:00 AM' },
			],
			ticks,
			now: 0,
		});
		const segment = screen.getByRole('button', { name: 'Work, 12:00 AM to 1:00 AM' });
		expect(percent(segment.style.left)).toBeCloseTo(0);
		expect(percent(segment.style.width)).toBeCloseTo(100 / 23);
	});

	it('positions segments proportionally in a 25-hour day', () => {
		render(DayRibbon, {
			dayStart: 0,
			dayEnd: 25 * HOUR,
			segments: [{ id: 'w', start: 12 * HOUR, end: 13 * HOUR, color: 'lake', label: 'Noon hour' }],
			ticks,
			now: 0,
		});
		const segment = screen.getByRole('button', { name: 'Noon hour' });
		expect(percent(segment.style.left)).toBeCloseTo(48);
		expect(percent(segment.style.width)).toBeCloseTo(4);
	});

	it('ends a running segment at now and shows the tick inside the day', () => {
		const { container } = render(DayRibbon, {
			dayStart: 0,
			dayEnd: 24 * HOUR,
			segments: [{ id: 'r', start: 12 * HOUR, end: null, color: 'fern', label: 'Running' }],
			ticks,
			now: 18 * HOUR,
		});
		const segment = screen.getByRole('button', { name: 'Running' });
		expect(percent(segment.style.width)).toBeCloseTo(25);
		expect(container.querySelector('.now')?.getAttribute('style')).toContain('75%');
	});

	it('hides the now tick outside the day', () => {
		const { container } = render(DayRibbon, {
			dayStart: 0,
			dayEnd: 24 * HOUR,
			segments: [],
			ticks,
			now: 25 * HOUR,
		});
		expect(container.querySelector('.now')).toBeNull();
	});

	it('calls onselect with the segment id', async () => {
		const onselect = vi.fn();
		render(DayRibbon, {
			dayStart: 0,
			dayEnd: 24 * HOUR,
			segments: [{ id: 'abc', start: 0, end: HOUR, color: 'lake', label: 'Work' }],
			ticks,
			now: 0,
			onselect,
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Work' }));
		expect(onselect).toHaveBeenCalledWith('abc');
	});
});
