import type { ReportConfig } from '../report/config';
import type { HeadingKey } from '../report/config';
import { headingLabel } from '../report/format';
import type { ReportRow } from '../report/entries';
import type { Day } from '../time';

/** Session columns in export order; CSV and XLSX share it, so the two files cannot drift apart. */
export const SESSION_COLUMNS = [
	'date',
	'start',
	'end',
	'duration',
	'hours',
	'type',
	'counts_as_work',
	'project',
	'work_item',
	'note',
	'place',
] as const satisfies readonly HeadingKey[];

/** One exported session slice, with text kept exactly as stored. Missing names are empty strings. */
export type SessionCells = {
	date: Day;
	/** HH:mm in reporting_tz. */
	start: string;
	/** HH:mm in reporting_tz; a slice ending at midnight reads 00:00. */
	end: string;
	minutes: number;
	type: string;
	counts_as_work: boolean;
	project: string;
	work_item: string;
	/** Empty when show_notes is off. */
	note: string;
	place: string;
};

export function sessionHeadings(config: Pick<ReportConfig, 'headings'>): string[] {
	return SESSION_COLUMNS.map((key) => headingLabel(key, config));
}

export function sessionCells(row: ReportRow): SessionCells {
	const [, startTime = ''] = row.start_local.split('T');
	const [, endTime = ''] = row.end_local.split('T');
	return {
		date: row.day,
		start: startTime,
		end: endTime,
		minutes: row.minutes,
		type: row.type_name,
		counts_as_work: row.counts_as_work,
		project: row.project_name ?? '',
		work_item: row.work_item_name ?? '',
		note: row.note ?? '',
		place: row.place_name ?? '',
	};
}
