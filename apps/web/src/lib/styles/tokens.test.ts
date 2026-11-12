import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Contrast claims from docs/DESIGN_SYSTEM.md "Colour tokens", checked against tokens.css.

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function block(selector: string): string {
	const start = css.indexOf(`${selector} {`);
	if (start < 0) throw new Error(`missing block ${selector}`);
	const open = css.indexOf('{', start);
	let depth = 0;
	for (let i = open; i < css.length; i++) {
		if (css[i] === '{') depth++;
		if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
	}
	throw new Error(`unclosed block ${selector}`);
}

function vars(body: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of body.matchAll(/(--ht-[\w-]+):\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
	return out;
}

const light = vars(block(':root'));
const darkMedia = vars(block(":root:not([data-theme='light'])"));
const darkForced = vars(block(":root[data-theme='dark']"));
const dark = new Map([...light, ...darkForced]);

type Rgb = [number, number, number];

function hex(theme: Map<string, string>, name: string): Rgb {
	const v = theme.get(`--ht-${name}`);
	if (!v) throw new Error(`missing --ht-${name}`);
	const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!m) throw new Error(`--ht-${name} is not a hex colour: ${v}`);
	let h = m[1]!;
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
}

/** color-mix(in srgb, blaze p%, surface) */
function mix(blaze: Rgb, surface: Rgb, p: number): Rgb {
	return blaze.map((c, i) => c * p + surface[i]! * (1 - p)) as Rgb;
}

const BLAZES = [
	'lake',
	'saffron',
	'fern',
	'rowan',
	'heather',
	'spruce',
	'rose',
	'lichen',
	'slate',
	'bark',
] as const;

const themes = [
	['light', light],
	['dark', dark],
] as const;

describe('tokens.css', () => {
	it('defines both dark blocks identically', () => {
		expect([...darkMedia.entries()].sort()).toEqual([...darkForced.entries()].sort());
	});

	it('keeps ten blaze colours with mark and text in both themes', () => {
		for (const key of BLAZES) {
			for (const [, t] of themes) {
				expect(() => hex(t, `blaze-${key}`)).not.toThrow();
				expect(() => hex(t, `blaze-${key}-text`)).not.toThrow();
			}
			// In dark mode the mark doubles as text.
			expect(hex(dark, `blaze-${key}-text`)).toEqual(hex(dark, `blaze-${key}`));
		}
	});

	describe.each(themes)('%s theme', (_name, t) => {
		const on = (fg: string, bg: string) => contrast(hex(t, fg), hex(t, bg));

		it('ink is at least 13:1 on paper and surface', () => {
			expect(on('ink', 'paper')).toBeGreaterThanOrEqual(13);
			expect(on('ink', 'surface')).toBeGreaterThanOrEqual(13);
		});

		it('ink-2 is at least 6:1 on paper and surface', () => {
			expect(on('ink-2', 'paper')).toBeGreaterThanOrEqual(6);
			expect(on('ink-2', 'surface')).toBeGreaterThanOrEqual(6);
		});

		it('ink-3 is at least 4.5:1 on paper', () => {
			expect(on('ink-3', 'paper')).toBeGreaterThanOrEqual(4.5);
		});

		it('line-strong is at least 3:1 on paper and surface', () => {
			expect(on('line-strong', 'paper')).toBeGreaterThanOrEqual(3);
			expect(on('line-strong', 'surface')).toBeGreaterThanOrEqual(3);
		});

		it('danger and caution text are at least 4.5:1 on paper and surface', () => {
			for (const fg of ['danger', 'caution']) {
				expect(on(fg, 'paper')).toBeGreaterThanOrEqual(4.5);
				expect(on(fg, 'surface')).toBeGreaterThanOrEqual(4.5);
			}
		});

		it.each(BLAZES)('blaze %s mark is at least 3.4:1 on paper as a graphic', (key) => {
			expect(on(`blaze-${key}`, 'paper')).toBeGreaterThanOrEqual(3.4);
		});

		it.each(BLAZES)('ink on the %s wash is above 9.8:1', (key) => {
			const p = Number.parseFloat(t.get('--ht-wash-mix')!) / 100;
			const wash = mix(hex(t, `blaze-${key}`), hex(t, 'surface'), p);
			expect(contrast(hex(t, 'ink'), wash)).toBeGreaterThan(9.8);
		});
	});

	it.each(BLAZES)('light %s text colour is at least 5.5:1 on paper', (key) => {
		expect(contrast(hex(light, `blaze-${key}-text`), hex(light, 'paper'))).toBeGreaterThanOrEqual(
			5.5,
		);
	});

	it.each(BLAZES)('dark %s mark is readable as text (4.5:1) on paper and surface', (key) => {
		expect(contrast(hex(dark, `blaze-${key}`), hex(dark, 'paper'))).toBeGreaterThanOrEqual(4.5);
		expect(contrast(hex(dark, `blaze-${key}`), hex(dark, 'surface'))).toBeGreaterThanOrEqual(4.5);
	});
});
