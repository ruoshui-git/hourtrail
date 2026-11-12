import type { BlazeKey } from '@hourtrail/core';

export type TrailRow =
	| {
			kind: 'session';
			id: string;
			startLabel: string;
			endLabel: string | null;
			name: string | null;
			typeName: string;
			typeColor: BlazeKey;
			placeName?: string;
			note?: string;
			durationLabel: string;
			pending?: boolean;
			continuesFromPreviousDay?: boolean;
			continuesNextDay?: boolean;
			running?: boolean;
	  }
	| {
			kind: 'gap';
			id: string;
			start: number;
			end: number;
			rangeLabel: string;
			durationLabel: string;
	  };

export type RibbonSegment = {
	id: string;
	start: number;
	/** Running segments have no end; they end at `now`. */
	end: number | null;
	color: BlazeKey;
	label: string;
};

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Time of day as the device locale shows it, e.g. "4:02 AM" or "16:02". */
export function formatClock(at: number): string {
	return clockFormat.format(at);
}

/** Position of an instant within the day, 0 at dayStart and 100 at dayEnd (not clamped). */
export function percentOfDay(at: number, dayStart: number, dayEnd: number): number {
	return ((at - dayStart) / (dayEnd - dayStart)) * 100;
}

/** Whether `now` falls inside [dayStart, dayEnd). */
export function isInDay(now: number, dayStart: number, dayEnd: number): boolean {
	return now >= dayStart && now < dayEnd;
}

/**
 * Left offset and width, in percent of the day, for a span clipped to the day.
 * Returns null when the span does not overlap the day at all.
 */
export function ribbonSpan(
	start: number,
	end: number | null,
	now: number,
	dayStart: number,
	dayEnd: number,
): { left: number; width: number } | null {
	const from = Math.max(start, dayStart);
	const to = Math.min(end ?? now, dayEnd);
	if (to <= from) return null;
	const left = percentOfDay(from, dayStart, dayEnd);
	return { left, width: percentOfDay(to, dayStart, dayEnd) - left };
}
