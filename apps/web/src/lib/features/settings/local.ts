import { db } from '$lib/db/app';
import type { LocalKey } from '$lib/db/schema';
import type { ThemeChoice } from '$lib/theme';

/** Device-only settings must remain best-effort and never interrupt the screen. */
export async function getLocal<K extends LocalKey>(key: K): Promise<unknown> {
	try {
		return (await db.local.get(key))?.value;
	} catch {
		return undefined;
	}
}

export async function setLocal<K extends LocalKey>(key: K, value: unknown): Promise<void> {
	try {
		await db.local.put({ key, value });
	} catch {
		// Local preferences are best-effort; the current UI choice still applies.
	}
}

export async function getTheme(): Promise<ThemeChoice> {
	const value = await getLocal('theme');
	return value === 'light' || value === 'dark' ? value : 'system';
}
