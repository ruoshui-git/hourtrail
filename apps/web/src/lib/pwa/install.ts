export function shouldShowInstallHint(input: {
	userAgent: string;
	maxTouchPoints?: number;
	standalone: boolean;
	displayModeStandalone: boolean;
}): boolean {
	const appleMobile =
		/iPhone|iPad|iPod/i.test(input.userAgent) ||
		(/Macintosh/i.test(input.userAgent) && (input.maxTouchPoints ?? 0) > 1);
	const safari =
		/Safari/i.test(input.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(input.userAgent);
	return appleMobile && safari && !input.standalone && !input.displayModeStandalone;
}

const DISMISSED_KEY = 'hourtrail-install-hint-dismissed';
export function installHintDismissed(): boolean {
	try {
		return localStorage.getItem(DISMISSED_KEY) === 'true';
	} catch {
		return false;
	}
}
export function dismissInstallHint(): void {
	try {
		localStorage.setItem(DISMISSED_KEY, 'true');
	} catch {
		/* Storage is optional. */
	}
}
