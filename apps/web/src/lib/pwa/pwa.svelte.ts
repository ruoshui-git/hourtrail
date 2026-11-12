export const pwa = $state({ updateReady: false });
export function applyUpdate(): void {
	pwa.updateReady = true;
}
