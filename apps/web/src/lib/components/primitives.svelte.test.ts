import { createRawSnippet } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Button from './Button.svelte';
import Timer from './Timer.svelte';
import Bindings from './Bindings.fixture.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>Save changes</span>' }));

describe('Button', () => {
	it.each([{ disabled: true }, { busy: true }])('blocks clicks when %o', async (state) => {
		const onclick = vi.fn();
		render(Button, { ...state, children, onclick });
		const button = screen.getByRole('button', { name: 'Save changes' });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		if ('busy' in state) expect(button.getAttribute('aria-busy')).toBe('true');
		await fireEvent.click(button);
		expect(onclick).not.toHaveBeenCalled();
	});
	it('calls the handler for an enabled button', async () => {
		const onclick = vi.fn();
		render(Button, { children, onclick });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
		expect(onclick).toHaveBeenCalledOnce();
	});
});

describe('bound controls', () => {
	it('toggles Switch checked state and aria-checked from the whole row', async () => {
		render(Bindings);
		const control = screen.getByRole('switch', { name: 'Capture place' });
		expect(control.getAttribute('aria-checked')).toBe('false');
		await fireEvent.click(screen.getByText('Capture place'));
		expect(control.getAttribute('aria-checked')).toBe('true');
		expect(screen.getByLabelText('Switch value').textContent).toBe('true');
		await fireEvent.click(control);
		expect(control.getAttribute('aria-checked')).toBe('false');
		expect(screen.getByLabelText('Switch value').textContent).toBe('false');
		const disabled = screen.getByRole('switch', { name: 'Disabled switch' });
		await fireEvent.click(disabled);
		expect(disabled.getAttribute('aria-checked')).toBe('false');
	});
	it('clamps Stepper buttons and typed values to the bounds', async () => {
		render(Bindings);
		const value = screen.getByLabelText('Stepper value');
		await fireEvent.click(screen.getByRole('button', { name: 'Decrease Interval' }));
		expect(value.textContent).toBe('5');
		const plus = screen.getByRole('button', { name: 'Increase Interval' });
		await fireEvent.click(plus);
		expect(value.textContent).toBe('10');
		await fireEvent.click(plus);
		await fireEvent.click(plus);
		expect(value.textContent).toBe('15');
		await fireEvent.input(screen.getByRole('spinbutton', { name: 'Interval' }), {
			target: { value: '100' },
		});
		expect(value.textContent).toBe('15');
		await fireEvent.input(screen.getByRole('spinbutton', { name: 'Interval' }), {
			target: { value: '0' },
		});
		expect(value.textContent).toBe('5');
		expect(
			(screen.getByRole('spinbutton', { name: 'Disabled interval' }) as HTMLInputElement).disabled,
		).toBe(true);
	});
	it('moves and selects a segment with arrow keys, including wraparound', async () => {
		render(Bindings);
		const day = screen.getByRole('radio', { name: 'Day' });
		day.focus();
		await fireEvent.keyDown(day, { key: 'ArrowRight' });
		await vi.waitFor(() => expect(screen.getByLabelText('Range value').textContent).toBe('week'));
		expect(screen.getByRole('radio', { name: 'Week' }).getAttribute('aria-checked')).toBe('true');
		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
		await vi.waitFor(() => expect(screen.getByLabelText('Range value').textContent).toBe('day'));
		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
		await vi.waitFor(() => expect(screen.getByLabelText('Range value').textContent).toBe('month'));
	});
	it('toggles FilterChip aria-pressed and bound selected state', async () => {
		render(Bindings);
		const chip = screen.getByRole('button', { name: 'Work' });
		expect(chip.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(chip);
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByLabelText('Chip value').textContent).toBe('true');
		await fireEvent.click(chip);
		expect(chip.getAttribute('aria-pressed')).toBe('false');
		const disabled = screen.getByRole('button', { name: 'Disabled chip' });
		expect((disabled as HTMLButtonElement).disabled).toBe(true);
	});
	it('associates labels, hints and errors and preserves Unicode through binding', async () => {
		render(Bindings);
		const control = screen.getByRole('textbox', { name: 'Work item' });
		expect(control.getAttribute('aria-invalid')).toBe('true');
		expect(control.getAttribute('aria-describedby')).toBe('work-item-hint work-item-error');
		expect(document.getElementById('work-item-hint')?.textContent).toBe('Use any language');
		expect(document.getElementById('work-item-error')?.textContent).toBe('Enter a name');
		await fireEvent.input(control, { target: { value: '修复洗手台' } });
		expect(screen.getByLabelText('Text value').textContent).toBe('修复洗手台');
		await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), {
			target: { value: '第1寺院\n库存管理系统开发' },
		});
		expect(screen.getByLabelText('Note value').textContent).toBe('第1寺院\n库存管理系统开发');
		await fireEvent.change(screen.getByRole('combobox', { name: 'Place' }), {
			target: { value: 'office' },
		});
		expect(screen.getByLabelText('Place value').textContent).toBe('office');
		const date = screen.getByLabelText('Started', { exact: true });
		expect(date.getAttribute('type')).toBe('datetime-local');
		expect(date.getAttribute('step')).toBe('60');
		await fireEvent.input(date, { target: { value: '2026-11-12T07:00' } });
		expect(screen.getByLabelText('Started value').textContent).toBe('2026-11-12T07:00');
	});
});

it('renders each timer digit and colon as its own cell', () => {
	const { container } = render(Timer, { ms: 8047000 });
	expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('2:14:07');
	expect([...container.querySelectorAll('.cell')].map((cell) => cell.textContent)).toEqual([
		'2',
		':',
		'1',
		'4',
		':',
		'0',
		'7',
	]);
	expect(container.querySelectorAll('.colon')).toHaveLength(2);
});
