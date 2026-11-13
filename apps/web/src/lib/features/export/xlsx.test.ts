import { describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/node';
import {
	DEFAULT_ACTIVITY_TYPES,
	WORK_TYPE_ID,
	report,
	reportConfigSchema,
	sessionCells,
	sessionHeadings,
} from '@hourtrail/core';
import type { ReportConfig, ReportData, Session, WorkItem, Project, Place } from '@hourtrail/core';
import { toXlsx } from './xlsx';

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const at = (iso: string) => Date.parse(iso);
const NOW = at('2026-01-31T12:00:00Z');
const RANGE = { from: '2026-01-05', to: '2026-01-06' };
const common = { rev: 1, created_at: 0, updated_at: 0, updated_by: 'device-a', deleted_at: null };

const PROJECT = id(0x10);
const WORK_ITEM = id(0x20);
const WORK_ITEM_PLAIN = id(0x21);
const PLACE = id(0x30);

const NOTE = 'é vs é; 修复洗手台 👩‍💻 "quoted", a comma；「」\r\nsecond line 🚀';

function session(fields: Partial<Session> & Pick<Session, 'id' | 'start_at' | 'end_at'>): Session {
	return {
		...common,
		work_item_id: WORK_ITEM,
		type_id: WORK_TYPE_ID,
		start_tz: 'UTC',
		end_tz: 'UTC',
		note: '',
		source: 'live',
		place_id: null,
		place_state: 'none',
		place_candidates: [],
		origin_device_id: 'device-a',
		flags: {},
		...fields,
	};
}

const data: ReportData = {
	sessions: [
		session({
			id: id(1),
			place_id: PLACE,
			start_at: at('2026-01-05T09:05Z'),
			end_at: at('2026-01-05T11:19Z'),
			note: NOTE,
		}),
		// Crosses midnight: two slices, with minutes that sum to the session.
		session({
			id: id(2),
			work_item_id: WORK_ITEM_PLAIN,
			start_at: at('2026-01-05T23:40Z'),
			end_at: at('2026-01-06T01:10Z'),
			note: '  padded note with 库存 ',
		}),
	],
	work_items: [
		{
			...common,
			id: WORK_ITEM,
			name: '库存管理系统开发',
			description: '',
			type_id: WORK_TYPE_ID,
			project_id: PROJECT,
			place_id: null,
			pinned_at: null,
			pin_sort: 0,
			archived_at: null,
		} satisfies WorkItem,
		{
			...common,
			id: WORK_ITEM_PLAIN,
			name: 'Beta, "q"；',
			description: '',
			type_id: WORK_TYPE_ID,
			project_id: null,
			place_id: null,
			pinned_at: null,
			pin_sort: 0,
			archived_at: null,
		} satisfies WorkItem,
	],
	projects: [{ ...common, id: PROJECT, name: '第1寺院', archived_at: null } satisfies Project],
	types: DEFAULT_ACTIVITY_TYPES,
	places: [
		{
			...common,
			id: PLACE,
			name: '修复洗手台',
			lat: 0,
			lng: 0,
			radius_m: 100,
			description: '',
			archived_at: null,
		} satisfies Place,
	],
	settings: { reporting_tz: 'UTC', week_start: 1 },
};

const config: ReportConfig = reportConfigSchema.parse({
	title: '报告 🚀',
	range: RANGE,
	headings: { work_item: '工作项', project: '第1寺院' },
});

const codePoints = (s: string) => [...s].map((c) => c.codePointAt(0));

/** A sheet row by index; a missing row fails the test instead of reading undefined. */
function rowOf(rows: unknown[][], index: number): unknown[] {
	const row = rows[index];
	if (!row) throw new Error(`No row ${index} in the sheet`);
	return row;
}

/** The rows of a named sheet; a missing sheet fails the test. */
function sheetRows(sheets: { sheet: string; data: unknown[][] }[], name: string): unknown[][] {
	const found = sheets.find((sheet) => sheet.sheet === name);
	if (!found) throw new Error(`No sheet named ${name}`);
	return found.data;
}

/** Minutes since the Excel epoch (1899-12-30) that read-excel-file uses for time-formatted cells. */
const minutesOf = (value: unknown) => {
	if (!(value instanceof Date)) throw new Error(`Expected a Date, got ${String(value)}`);
	return (value.getTime() - Date.UTC(1899, 11, 30)) / 60_000;
};

async function roundTrip() {
	const result = report(config, data, { now: NOW });
	const blob = await toXlsx(result, config);
	// trim: false, because read-excel-file trims text by default and the export must not be trimmed.
	const sheets = await readXlsxFile(Buffer.from(await blob.arrayBuffer()), { trim: false });
	return { result, sheets };
}

describe('toXlsx', () => {
	it('writes a Summary sheet and a Sessions sheet, in that order', async () => {
		const { sheets } = await roundTrip();
		expect(sheets.map((s) => s.sheet)).toEqual(['Summary', 'Sessions']);
	});

	it('round-trips every Sessions text cell by code point, and every number exactly', async () => {
		const { result, sheets } = await roundTrip();
		const sessions = sheetRows(sheets, 'Sessions');
		expect(rowOf(sessions, 0).map((h) => codePoints(h as string))).toEqual(
			sessionHeadings(config).map(codePoints),
		);
		expect(sessions).toHaveLength(result.rows.length + 1);

		result.rows.forEach((row, index) => {
			const cells = sessionCells(row);
			const line = rowOf(sessions, index + 1);
			// Date: a real date cell, read back as its UTC day.
			expect(line[0]).toBeInstanceOf(Date);
			expect((line[0] as Date).toISOString().slice(0, 10)).toBe(cells.date);
			// Start and End: time-formatted cells, stored as minutes since the Excel epoch.
			const [sh = 0, sm = 0] = cells.start.split(':').map(Number);
			const [eh = 0, em = 0] = cells.end.split(':').map(Number);
			expect(minutesOf(line[1])).toBe(sh * 60 + sm);
			expect(minutesOf(line[2])).toBe(eh * 60 + em);
			// Duration: a [h]:mm time fraction, so it reads back as a duration, not a plain number.
			expect(minutesOf(line[3])).toBe(cells.minutes);
			// Hours is a plain decimal number.
			expect(line[4]).toBe(cells.minutes / 60);
			// Text cells: identical code points; an empty field is an empty cell.
			const texts = [
				cells.type,
				cells.counts_as_work ? 'Yes' : 'No',
				cells.project,
				cells.work_item,
				cells.note,
				cells.place,
			];
			[5, 6, 7, 8, 9, 10].forEach((col, i) => {
				const actual = line[col];
				const expected = texts[i] ?? '';
				if (expected === '') {
					expect(actual).toBeNull();
				} else {
					expect(typeof actual).toBe('string');
					expect(codePoints(actual as string)).toEqual(codePoints(expected));
				}
			});
		});
	});

	it('keeps the source text unchanged, including padding and the CRLF inside a note', async () => {
		const { sheets } = await roundTrip();
		const sessions = sheetRows(sheets, 'Sessions');
		expect(codePoints(rowOf(sessions, 1)[9] as string)).toEqual(codePoints(NOTE));
		expect(codePoints(rowOf(sessions, 2)[9] as string)).toEqual(
			codePoints('  padded note with 库存 '),
		);
		expect(codePoints(rowOf(sessions, 1)[8] as string)).toEqual(codePoints('库存管理系统开发'));
		expect(codePoints(rowOf(sessions, 1)[7] as string)).toEqual(codePoints('第1寺院'));
		expect(codePoints(rowOf(sessions, 1)[10] as string)).toEqual(codePoints('修复洗手台'));
	});

	it('writes the Summary numbers and text with the same figures as the report', async () => {
		const { result, sheets } = await roundTrip();
		const summary = sheetRows(sheets, 'Summary');
		expect(rowOf(summary, 0)[0]).toBe('报告 🚀');
		expect(codePoints(rowOf(summary, 1)[0] as string)).toEqual(codePoints('Range'));
		expect(typeof rowOf(summary, 3)[1]).toBe('number');
		expect(rowOf(summary, 3)[1]).toBe(result.work_minutes / 60);
		const totalRow = summary.findIndex((row) => row[0] === 'Total');
		expect(rowOf(summary, totalRow)[1]).toBe(result.total_minutes / 60);
		const groupHeaderRow = summary.findIndex((row) => row[0] === '工作项');
		expect(groupHeaderRow).toBeGreaterThan(0);
		result.groups.forEach((group, i) => {
			const line = rowOf(summary, groupHeaderRow + 1 + i);
			expect(codePoints(line[0] as string)).toEqual(codePoints(group.label));
			expect(line[3]).toBe(group.minutes / 60);
		});
	});
});
