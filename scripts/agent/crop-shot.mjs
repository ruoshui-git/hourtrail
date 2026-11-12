// Crop a tall screenshot into review-sized slices (no image libraries on this host).
// Usage: node scripts/agent/crop-shot.mjs IN.png OUT_PREFIX [SLICE_HEIGHT=1400] [SCALE=1]
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [file, out, sliceH = '1400', scale = '1'] = process.argv.slice(2);
const b64 = readFileSync(file).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(
	`<body style="margin:0"><img id=i src="data:image/png;base64,${b64}" style="display:block;width:auto;"></body>`,
);
const { w, h } = await page.$eval('#i', (img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
const sw = Math.round(w * Number(scale)),
	sh = Math.round(h * Number(scale));
await page.$eval(
	'#i',
	(img, [sw]) => {
		img.style.width = sw + 'px';
	},
	[sw],
);
await page.setViewportSize({ width: sw, height: Number(sliceH) });
let n = 0;
for (let y = 0; y < sh; y += Number(sliceH)) {
	await page.screenshot({
		path: `${out}-${String(n++).padStart(2, '0')}.png`,
		clip: { x: 0, y, width: sw, height: Math.min(Number(sliceH), sh - y) },
		fullPage: true,
	});
}
await browser.close();
console.log(n, 'slices', sw, 'x', sh);
