import { describe, expect, it } from 'vitest';
import { shouldShowInstallHint } from './install';

describe('install hint decision', () => {
	it('shows for iPhone Safari only outside standalone mode', () => {
		const userAgent =
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari/605.1';
		expect(
			shouldShowInstallHint({ userAgent, standalone: false, displayModeStandalone: false }),
		).toBe(true);
		expect(
			shouldShowInstallHint({ userAgent, standalone: true, displayModeStandalone: false }),
		).toBe(false);
		expect(
			shouldShowInstallHint({ userAgent, standalone: false, displayModeStandalone: true }),
		).toBe(false);
	});
	it('does not show for desktop or other iOS browsers', () => {
		expect(
			shouldShowInstallHint({
				userAgent: 'Mozilla/5.0 Chrome/120',
				standalone: false,
				displayModeStandalone: false,
			}),
		).toBe(false);
		expect(
			shouldShowInstallHint({
				userAgent: 'iPhone CriOS/120 Safari/604',
				standalone: false,
				displayModeStandalone: false,
			}),
		).toBe(false);
	});
});
