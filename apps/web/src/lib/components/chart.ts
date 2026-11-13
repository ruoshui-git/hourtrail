import type { BlazeKey } from '@hourtrail/core';
import { formatHours } from '@hourtrail/core';

/** One stacked series (an activity type). Stack order is the order of the series array, bottom to top. */
export type ChartSeries = { key: string; label: string; color: BlazeKey };

/** One column: minutes per series key. Keys missing from `values` count as zero. */
export type ChartBar = { id: string; label: string; values: Record<string, number> };

const STEPS = [1, 2, 2.5, 5, 10];

/** Clean round ticks from 0 up to at least `maxValue`. Works for any unit (minutes, hours). */
export function niceTicks(maxValue: number, targetCount = 4): number[] {
	if (!Number.isFinite(maxValue) || maxValue <= 0) return [0];
	const raw = maxValue / Math.max(1, Math.floor(targetCount));
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const normalized = raw / magnitude;
	const step = (STEPS.find((candidate) => candidate >= normalized) ?? 10) * magnitude;
	const last = Math.ceil(maxValue / step - 1e-9);
	return Array.from({ length: last + 1 }, (_, index) => Number((index * step).toPrecision(12)));
}

/** Durations in minutes as `5h 12m`, `45m`, `0m`. Hours are unpadded; minutes are padded once hours show. */
export function formatMinutes(minutes: number, format: 'hm' | 'decimal' = 'hm'): string {
	const total = Math.max(0, Math.round(toMinutes(minutes)));
	return formatHours(total, format);
}

/** Minutes as a non-negative finite number; anything else counts as zero. */
export function toMinutes(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function barTotal(bar: ChartBar): number {
	return Object.values(bar.values).reduce<number>((sum, value) => sum + toMinutes(value), 0);
}

/**
 * Contiguous segments for one column, in the bar's key order, bottom to top. Zero segments are
 * skipped. Values are cumulative in value units; the pixel gap between segments is applied when
 * drawing, so adjacent segments here share an edge (y1 of one equals y0 of the next).
 */
export function stackSegments(bar: ChartBar): { key: string; y0: number; y1: number }[] {
	const segments: { key: string; y0: number; y1: number }[] = [];
	let y = 0;
	for (const [key, value] of Object.entries(bar.values)) {
		const minutes = toMinutes(value);
		if (minutes === 0) continue;
		segments.push({ key, y0: y, y1: y + minutes });
		y += minutes;
	}
	return segments;
}

/** Rough rendered width in px of a label at caption size (13px). CJK glyphs are about one em wide. */
export function estimateTextWidth(text: string): number {
	let width = 0;
	for (const character of text) {
		const code = character.codePointAt(0) ?? 0;
		// Calibrated against caption-size rendering: "38h 30m" measures 58 px.
		width += code >= 0x2e80 ? 13 : code === 0x20 ? 4 : 9;
	}
	return width;
}
