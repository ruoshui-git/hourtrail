import 'fake-indexeddb/auto';
import { flushSync } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { newId } from '@hourtrail/core';
import { createRepo } from './db/repo';
import { openDb } from './db/schema';
import type { HourtrailDB } from './db/schema';
import { live } from './live.svelte';

const databases: HourtrailDB[] = [];
const destroyers: (() => void)[] = [];
afterEach(async () => {
	for (const destroy of destroyers.splice(0)) destroy();
	await Promise.all(databases.splice(0).map((db) => db.delete()));
});

it('exposes the initial value, observes writes, and unsubscribes when its scope is destroyed', async () => {
	const db = openDb(`live-${newId()}`);
	databases.push(db);
	const repo = createRepo(
		db,
		() => 1000,
		() => 'UTC',
	);
	const query = vi.fn(() => db.session.count());
	let items!: ReturnType<typeof live<number>>;
	const destroy = $effect.root(() => {
		items = live(query, -1);
	});
	destroyers.push(destroy);
	expect(items.current).toBe(-1);
	expect(items.error).toBeUndefined();
	flushSync();
	await vi.waitFor(() => expect(items.current).toBe(0));
	await repo.start();
	await vi.waitFor(() => expect(items.current).toBe(1));
	destroy();
	const calls = query.mock.calls.length;
	// A second live query gives a scheduling barrier for the later write.
	let active!: ReturnType<typeof live<number>>;
	destroyers.push(
		$effect.root(() => {
			active = live(() => db.session.count(), -1);
		}),
	);
	flushSync();
	await vi.waitFor(() => expect(active.current).toBe(1));
	await repo.switchTo({ workItemId: null });
	await vi.waitFor(() => expect(active.current).toBe(2));
	expect(items.current).toBe(1);
	expect(query).toHaveBeenCalledTimes(calls);
});

it.each(['sync', 'async'])('exposes a %s query error', async (kind) => {
	const reason = new Error('Query failed');
	let items!: ReturnType<typeof live<number>>;
	destroyers.push(
		$effect.root(() => {
			items = live(() => {
				if (kind === 'async') return Promise.reject(reason);
				throw reason;
			}, 42);
		}),
	);
	flushSync();
	await vi.waitFor(() => expect(items.error).toBe(reason));
	expect(items.current).toBe(42);
});

it('does not subscribe if destroyed before effects mount', () => {
	const query = vi.fn(() => 1);
	const destroy = $effect.root(() => {
		live(query, 0);
	});
	destroy();
	flushSync();
	expect(query).not.toHaveBeenCalled();
});
