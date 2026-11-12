export type ThemeChoice = 'system' | 'light' | 'dark';

export function applyTheme(choice: ThemeChoice, root = document.documentElement): void {
	if (choice === 'system') root.removeAttribute('data-theme');
	else root.setAttribute('data-theme', choice);
}
