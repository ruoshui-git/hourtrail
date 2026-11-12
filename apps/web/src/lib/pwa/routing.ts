export type FetchRoute = 'ignore' | 'navigation' | 'asset';

export function fetchRoute(
	method: string,
	pathname: string,
	origin: string,
	requestOrigin: string,
): FetchRoute {
	if (
		method !== 'GET' ||
		requestOrigin !== origin ||
		pathname === '/api' ||
		pathname.startsWith('/api/')
	) {
		return 'ignore';
	}
	return pathname === '/' || pathname.endsWith('/') || !pathname.split('/').at(-1)?.includes('.')
		? 'navigation'
		: 'asset';
}
