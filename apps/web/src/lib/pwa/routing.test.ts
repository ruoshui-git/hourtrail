import { describe, expect, it } from 'vitest';
import { fetchRoute } from './routing';

describe('service worker fetch routing', () => {
	const origin = 'https://hourtrail.test';
	it('uses the shell for navigations', () =>
		expect(fetchRoute('GET', '/history', origin, origin)).toBe('navigation'));
	it('uses cache-first for assets', () =>
		expect(fetchRoute('GET', '/_app/file.js', origin, origin)).toBe('asset'));
	it('ignores API and non-GET requests', () => {
		expect(fetchRoute('GET', '/api/health', origin, origin)).toBe('ignore');
		expect(fetchRoute('POST', '/history', origin, origin)).toBe('ignore');
	});
});
