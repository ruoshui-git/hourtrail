import type { ReportConfig } from '../report/config';
import { formatHours } from '../report/format';
import type { Report } from '../report/report';
import { monthBounds } from '../time';
import { sessionCells, sessionHeadings } from './sessions';
import type { SessionCells } from './sessions';

const BOM = '﻿';
const CRLF = '\r\n';

/** RFC 4180: quote a field that holds a comma, a double quote, CR or LF; double inner quotes. */
function csvField(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** "h:mm" with hours unpadded, for example 2:14 or 10:05. */
export function formatDuration(minutes: number): string {
	if (!Number.isInteger(minutes) || minutes < 0) {
		throw new RangeError('Minutes must be a non-negative integer');
	}
	return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function csvValues(cells: SessionCells): string[] {
	return [
		cells.date,
		cells.start,
		cells.end,
		formatDuration(cells.minutes),
		formatHours(cells.minutes, 'decimal'),
		cells.type,
		cells.counts_as_work ? 'Yes' : 'No',
		cells.project,
		cells.work_item,
		cells.note,
		cells.place,
	];
}

/**
 * One row per session slice, in report order. UTF-8 BOM first, CRLF line endings, text
 * exported exactly as stored.
 */
export function toCsv(report: Report, config: ReportConfig): string {
	const lines = [
		sessionHeadings(config),
		...report.rows.map((row) => csvValues(sessionCells(row))),
	];
	return BOM + lines.map((fields) => fields.map(csvField).join(',') + CRLF).join('');
}

/** The file name without extension, for example hourtrail-report-2026-11 for a whole month. */
export function reportFileBase(config: Pick<ReportConfig, 'range'>): string {
	const { from, to } = config.range;
	const month = monthBounds(from);
	if (from === month.first && to === month.last) {
		return `hourtrail-report-${from.slice(0, 7)}`;
	}
	return `hourtrail-report-${from}-to-${to}`;
}

export function csvFileName(config: Pick<ReportConfig, 'range'>): string {
	return `${reportFileBase(config)}.csv`;
}
