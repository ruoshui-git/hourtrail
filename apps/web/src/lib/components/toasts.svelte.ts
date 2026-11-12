export type ToastInput = {
	message: string;
	action?: { label: string; run: () => void };
	undo?: () => void;
	durationMs?: number;
};

type Toast = ToastInput & { id: string };

type Timer = {
	handle?: ReturnType<typeof setTimeout>;
	remaining: number;
	startedAt: number;
	holds: SvelteSet<string>;
};

const DEFAULT_DURATION_MS = 6000;

import { SvelteMap, SvelteSet } from 'svelte/reactivity';

let items = $state<Toast[]>([]);
const timers = new SvelteMap<string, Timer>();
let sequence = 0;

function start(id: string, timer: Timer) {
	timer.startedAt = Date.now();
	timer.handle = setTimeout(() => dismissToast(id), timer.remaining);
}

function stop(timer: Timer) {
	if (timer.handle === undefined) return;
	clearTimeout(timer.handle);
	timer.handle = undefined;
	timer.remaining -= Date.now() - timer.startedAt;
}

/** Shows a toast and starts its timer. Returns the toast id. */
export function showToast(input: ToastInput): string {
	const id = `toast-${++sequence}`;
	const duration = input.durationMs ?? DEFAULT_DURATION_MS;
	items = [...items, { ...input, id }];
	const timer: Timer = { remaining: duration, startedAt: 0, holds: new SvelteSet() };
	timers.set(id, timer);
	start(id, timer);
	return id;
}

export function dismissToast(id: string): void {
	const timer = timers.get(id);
	if (timer) stop(timer);
	timers.delete(id);
	items = items.filter((toast) => toast.id !== id);
}

/**
 * Pauses the timer while a reason holds it (for example 'hover' or 'focus').
 * The timer resumes only when every reason has been released.
 */
export function holdToast(id: string, reason: string, held: boolean): void {
	const timer = timers.get(id);
	if (!timer) return;
	if (held) timer.holds.add(reason);
	else timer.holds.delete(reason);
	if (timer.holds.size > 0) stop(timer);
	else if (timer.handle === undefined && timer.remaining > 0) start(id, timer);
}

export const toasts = {
	get items(): readonly Toast[] {
		return items;
	},
};
