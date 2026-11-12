// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyTheme } from './theme';

describe('applyTheme', () => {
	it('sets explicit light and dark choices on the supplied root', () => {
		const root = document.createElement('div');
		applyTheme('light', root);
		expect(root.dataset.theme).toBe('light');
		applyTheme('dark', root);
		expect(root.dataset.theme).toBe('dark');
	});
	it('removes the override for the system choice', () => {
		const root = document.createElement('div');
		applyTheme('dark', root);
		applyTheme('system', root);
		expect(root.hasAttribute('data-theme')).toBe(false);
	});
	it('defaults to the document root', () => {
		applyTheme('dark');
		expect(document.documentElement.dataset.theme).toBe('dark');
		applyTheme('system');
		expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
	});
});
