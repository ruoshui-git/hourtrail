import { formatLinkCode, normalizeLinkCode } from '@hourtrail/core';

export function guessDeviceName(userAgent: string, platform = ''): string {
	const ua = `${userAgent} ${platform}`.toLowerCase();
	if (/ipad/.test(ua) || (/macintosh/.test(ua) && /touch|mobile/.test(ua))) return 'iPad';
	if (/iphone|ipod/.test(ua)) return 'iPhone';
	if (/macintosh|mac os/.test(ua)) return 'Mac';
	if (/windows/.test(ua)) return 'Windows PC';
	if (/android/.test(ua)) return 'Android phone';
	return 'This device';
}

function dateParts(ms: number, tz: string): Record<'year' | 'month' | 'day', string> {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(ms);
	return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<
		'year' | 'month' | 'day',
		string
	>;
}

export function formatLastSeen(ms: number, now: number, tz: string): string {
	const target = dateParts(ms, tz);
	const current = dateParts(now, tz);
	const targetKey = `${target.year}-${target.month}-${target.day}`;
	const currentKey = `${current.year}-${current.month}-${current.day}`;
	const yesterdayDate = new Date(Date.UTC(+current.year, +current.month - 1, +current.day - 1));
	const yesterdayKey = `${yesterdayDate.getUTCFullYear()}-${String(yesterdayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getUTCDate()).padStart(2, '0')}`;
	const time = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hour: 'numeric',
		minute: '2-digit',
	}).format(ms);
	if (targetKey === currentKey) return `Today, ${time}`;
	if (targetKey === yesterdayKey) return `Yesterday, ${time}`;
	const date = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(ms);
	return `${date}, ${time}`;
}

export function lockoutMessage(retryAfterS: number): string {
	const minutes = Math.max(1, Math.ceil(retryAfterS / 60));
	return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

export function linkUrl(origin: string, code: string): string {
	const canonical = normalizeLinkCode(code) ?? code.replace(/-/g, '');
	return `${origin}/link#${formatLinkCode(canonical)}`;
}

export function codeFromHash(hash: string): string | null {
	let value: string;
	try {
		value = decodeURIComponent(hash.replace(/^#/, ''));
	} catch {
		return null;
	}
	const code = normalizeLinkCode(value);
	return code ? formatLinkCode(code) : null;
}
