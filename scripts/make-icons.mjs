// Render apps/web/assets/icon.svg to the PNG icons the manifest and iOS need.
// Usage: node scripts/make-icons.mjs   (uses Playwright's Chromium)
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('apps/web/assets/icon.svg', 'utf8');
const out = 'apps/web/static/icons';
const targets = [
	['icon-192.png', 192],
	['icon-512.png', 512],
	['icon-maskable-512.png', 512],
	['apple-touch-icon-180.png', 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size] of targets) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
	);
	await page.screenshot({ path: `${out}/${file}`, omitBackground: false });
}
await browser.close();
console.log(`wrote ${targets.length} icons to ${out}`);
