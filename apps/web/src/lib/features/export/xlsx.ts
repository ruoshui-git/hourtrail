import { headingLabel, sessionCells, sessionHeadings } from '@hourtrail/core';
import type { HeadingKey, Report, ReportConfig, SessionCells } from '@hourtrail/core';
import type { Cell, SheetData } from 'write-excel-file/browser';

const MINUTES_PER_DAY = 24 * 60;

/** Text in a string-typed cell; an empty string stays an empty cell. */
function text(value: string): Cell {
	return value === '' ? null : { value, type: String };
}

function bold(value: string): Cell {
	return { value, type: String, fontWeight: 'bold' };
}

function hours(minutes: number): Cell {
	return { value: minutes / 60, type: Number, format: '0.00' };
}

function duration(minutes: number): Cell {
	return { value: minutes / MINUTES_PER_DAY, type: Number, format: '[h]:mm' };
}

/** A clock time such as 09:05 as an Excel time fraction of the day. */
function clock(hhmm: string): Cell {
	const [hour = 0, minute = 0] = hhmm.split(':').map(Number);
	return { value: (hour * 60 + minute) / MINUTES_PER_DAY, type: Number, format: 'hh:mm' };
}

/** A calendar day as a real date at UTC midnight, so the day never shifts with the zone. */
function day(value: string): Cell {
	return { value: new Date(`${value}T00:00:00Z`), type: Date, format: 'yyyy-mm-dd' };
}

const GROUP_HEADING: Record<ReportConfig['group_by'], HeadingKey> = {
	work_item: 'work_item',
	project: 'project',
	type: 'type',
	day: 'date',
};

function summarySheet(report: Report, config: ReportConfig): SheetData {
	const label = (key: HeadingKey) => headingLabel(key, config);
	const rows: SheetData = [
		[bold(report.title)],
		[text('Range'), text(`${report.range.from} to ${report.range.to}`)],
		[null],
		[text(label('work_hours')), hours(report.work_minutes)],
		[bold(label('other_hours'))],
		...report.other_minutes.map((other) => [text(other.name), hours(other.minutes)]),
		[bold(label('total')), hours(report.total_minutes)],
		[null],
		[
			bold(label(GROUP_HEADING[config.group_by])),
			bold(label('work_hours')),
			bold(label('other_hours')),
			bold(label('total')),
		],
		...report.groups.map((group) => [
			text(group.label),
			hours(group.work_minutes),
			hours(group.other_minutes),
			hours(group.minutes),
		]),
	];
	return rows;
}

function sessionRow(cells: SessionCells): Cell[] {
	return [
		day(cells.date),
		clock(cells.start),
		clock(cells.end),
		duration(cells.minutes),
		hours(cells.minutes),
		text(cells.type),
		text(cells.counts_as_work ? 'Yes' : 'No'),
		text(cells.project),
		text(cells.work_item),
		text(cells.note),
		text(cells.place),
	];
}

function sessionsSheet(report: Report, config: ReportConfig): SheetData {
	return [
		sessionHeadings(config).map(bold),
		...report.rows.map((row) => sessionRow(sessionCells(row))),
	];
}

/**
 * The report as an .xlsx Blob with a Summary and a Sessions sheet. write-excel-file is loaded
 * on demand so it stays out of the main bundle.
 */
export async function toXlsx(report: Report, config: ReportConfig): Promise<Blob> {
	const { default: writeXlsxFile } = await import('write-excel-file/browser');
	const sheets = [
		{
			sheet: 'Summary',
			data: summarySheet(report, config),
			columns: [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }],
		},
		{
			sheet: 'Sessions',
			data: sessionsSheet(report, config),
			columns: [
				{ width: 12 },
				{ width: 8 },
				{ width: 8 },
				{ width: 10 },
				{ width: 8 },
				{ width: 12 },
				{ width: 14 },
				{ width: 20 },
				{ width: 24 },
				{ width: 40 },
				{ width: 20 },
			],
		},
	];
	return writeXlsxFile(sheets).toBlob();
}
