import type { HeadingKey, ReportConfig } from './config';

const DEFAULT_HEADINGS: Record<HeadingKey, string> = {
	date: 'Date',
	start: 'Start',
	end: 'End',
	duration: 'Duration',
	hours: 'Hours',
	type: 'Type',
	counts_as_work: 'Counts as work',
	project: 'Project',
	work_item: 'Work item',
	note: 'Note',
	place: 'Place',
	work_hours: 'Work hours',
	other_hours: 'Other hours',
	total: 'Total',
};

/** A non-empty custom heading wins; otherwise the English default. Custom text is never altered. */
export function headingLabel(key: HeadingKey, config: Pick<ReportConfig, 'headings'>): string {
	const custom = config.headings[key];
	return custom !== undefined && custom !== '' ? custom : DEFAULT_HEADINGS[key];
}

/** Formats whole minutes as "2h 14m" or "2.23"; minutes are never negative or fractional here. */
export function formatHours(minutes: number, format: 'hm' | 'decimal'): string {
	if (!Number.isInteger(minutes) || minutes < 0) {
		throw new RangeError('Minutes must be a non-negative integer');
	}
	if (format === 'decimal') return (minutes / 60).toFixed(2);
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
