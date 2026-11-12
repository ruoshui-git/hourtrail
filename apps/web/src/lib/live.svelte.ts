import { liveQuery } from 'dexie';

/** Wrap Dexie liveQuery in a component or $effect.root; read items.current. */
export function live<T>(
	query: () => T | Promise<T>,
	initial: T,
): { readonly current: T; readonly error: unknown } {
	let current = $state.raw(initial);
	let error = $state.raw<unknown>(undefined);
	$effect(() => {
		const subscription = liveQuery(async () => await query()).subscribe({
			next: (value) => {
				current = value;
			},
			error: (reason: unknown) => {
				error = reason;
			},
		});
		return () => subscription.unsubscribe();
	});
	return {
		get current() {
			return current;
		},
		get error() {
			return error;
		},
	};
}
