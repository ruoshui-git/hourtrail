import { describe, expect, it } from 'vitest';
import {
	configFor,
	at,
	id,
	place,
	PLACE_A,
	PROJECT_A,
	WORK_ITEM_A,
	WORK_ITEM_B,
	project,
	reportData,
	session,
	workItem,
} from '../report/fixtures';
import { OVERHEAD_TYPE_ID } from '../schema';
import { reportConfigSchema } from '../report/config';
import { report } from '../report/report';
import type { ReportConfig } from '../report/config';
import type { ReportData } from '../report/entries';
import { csvFileName, formatDuration, reportFileBase, toCsv } from './csv';

const RANGE = { from: '2026-01-05', to: '2026-01-05' };
const NOW = at('2026-01-31T12:00:00Z');
const PLAIN = reportConfigSchema.parse({ range: RANGE });

/** Strict RFC 4180 reader for the test only: quoted fields, doubled quotes, CRLF records. */
function parseCsv(input: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let fieldHasQuotes = false;
	for (let i = 0; i < input.length;) {
		const ch = input[i];
		if (quoted) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				quoted = false;
				i += 1;
				continue;
			}
			field += ch;
			i += 1;
			continue;
		}
		if (ch === '"') {
			if (field !== '') throw new Error(`Quote inside an unquoted field at ${i}`);
			quoted = true;
			fieldHasQuotes = true;
			i += 1;
		} else if (ch === ',') {
			row.push(field);
			field = '';
			fieldHasQuotes = false;
			i += 1;
		} else if (ch === '\r' && input[i + 1] === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i += 2;
		} else if (ch === '\r' || ch === '\n') {
			throw new Error(`Bare line break outside quotes at ${i}`);
		} else {
			field += ch;
			i += 1;
		}
	}
	if (quoted) throw new Error('Unterminated quoted field');
	if (field !== '' || row.length > 0 || fieldHasQuotes) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** A parsed field, failing loudly when the row or the column does not exist. */
function cell(row: string[] | undefined, index: number): string {
	const value = row?.[index];
	if (value === undefined) throw new Error(`No field ${index} in the parsed row`);
	return value;
}

function sessionReport(config: ReportConfig, data: ReportData) {
	return report(config, data, { now: NOW });
}

describe('toCsv structure', () => {
	it('starts with a UTF-8 BOM, uses CRLF endings and writes the headers in column order', () => {
		const data = reportData({
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T09:00Z'),
					end_at: at('2026-01-05T11:14Z'),
					note: 'plain',
				}),
			],
		});
		const csv = toCsv(sessionReport(PLAIN, data), PLAIN);
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		expect(csv.slice(1)).toBe(
			[
				'Date,Start,End,Duration,Hours,Type,Counts as work,Project,Work item,Note,Place',
				'2026-01-05,09:00,11:14,2:14,2.23,Work,Yes,第1寺院,库存管理系统开发,plain,',
				'',
			].join('\r\n'),
		);
		expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	it('writes only the header row when nothing falls in the range', () => {
		const csv = toCsv(sessionReport(PLAIN, reportData()), PLAIN);
		expect(parseCsv(csv.slice(1))).toEqual([
			[
				'Date',
				'Start',
				'End',
				'Duration',
				'Hours',
				'Type',
				'Counts as work',
				'Project',
				'Work item',
				'Note',
				'Place',
			],
		]);
	});

	it('writes one row per session slice, so a midnight crossing gives two rows', () => {
		const config = configFor({ from: '2026-01-05', to: '2026-01-06' });
		const data = reportData({
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T23:00Z'),
					end_at: at('2026-01-06T01:30Z'),
				}),
			],
		});
		const rows = parseCsv(toCsv(sessionReport(config, data), config).slice(1));
		expect(rows.slice(1).map((r) => [r[0], r[1], r[2], r[3], r[4]])).toEqual([
			['2026-01-05', '23:00', '00:00', '1:00', '1.00'],
			['2026-01-06', '00:00', '01:30', '1:30', '1.50'],
		]);
	});
});

describe('toCsv formats', () => {
	it('formats Duration as h:mm and Hours with two decimals, including durations over ten hours', () => {
		const data = reportData({
			sessions: [
				session({ id: id(1), start_at: at('2026-01-05T00:00Z'), end_at: at('2026-01-05T00:05Z') }),
				session({ id: id(2), start_at: at('2026-01-05T01:00Z'), end_at: at('2026-01-05T11:59Z') }),
				session({ id: id(3), start_at: at('2026-01-05T12:00Z'), end_at: at('2026-01-05T12:01Z') }),
			],
		});
		const rows = parseCsv(toCsv(sessionReport(PLAIN, data), PLAIN).slice(1)).slice(1);
		expect(rows.map((r) => [r[3], r[4]])).toEqual([
			['0:05', '0.08'],
			['10:59', '10.98'],
			['0:01', '0.02'],
		]);
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(600)).toBe('10:00');
	});

	it('uses Yes and No for Counts as work, and the type name', () => {
		const data = reportData({
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T09:00Z'),
					end_at: at('2026-01-05T10:00Z'),
					type_id: OVERHEAD_TYPE_ID,
				}),
			],
		});
		const row = parseCsv(toCsv(sessionReport(PLAIN, data), PLAIN).slice(1))[1];
		expect(cell(row, 5)).toBe('Overhead');
		expect(cell(row, 6)).toBe('No');
	});

	it('uses custom headings in any language, and falls back to English for the rest', () => {
		const config = configFor(RANGE, {
			headings: { date: '日期', start: '开始', duration: '时长', note: '备注', hours: '小时' },
		});
		const data = reportData({
			sessions: [
				session({ id: id(1), start_at: at('2026-01-05T09:00Z'), end_at: at('2026-01-05T10:00Z') }),
			],
		});
		const [headers] = parseCsv(toCsv(sessionReport(config, data), config).slice(1));
		expect(headers).toEqual([
			'日期',
			'开始',
			'End',
			'时长',
			'小时',
			'Type',
			'Counts as work',
			'Project',
			'Work item',
			'备注',
			'Place',
		]);
	});

	it('leaves the Note column empty when show_notes is false', () => {
		const config = configFor(RANGE, { show_notes: false });
		const data = reportData({
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T09:00Z'),
					end_at: at('2026-01-05T10:00Z'),
					note: '修复洗手台',
				}),
			],
		});
		const row = parseCsv(toCsv(sessionReport(config, data), config).slice(1))[1];
		expect(cell(row, 9)).toBe('');
		expect(cell(row, 10)).toBe('');
	});

	it('quotes fields with commas, quotes and line breaks, and doubles inner quotes', () => {
		const data = reportData({
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T09:00Z'),
					end_at: at('2026-01-05T10:00Z'),
					note: 'a, "b"\r\nc',
				}),
			],
		});
		const csv = toCsv(sessionReport(PLAIN, data), PLAIN);
		expect(csv).toContain('"a, ""b""\r\nc"');
		expect(cell(parseCsv(csv.slice(1))[1], 9)).toBe('a, "b"\r\nc');
	});

	it('exports names and notes without trimming or normalizing', () => {
		const note = '  padded  ';
		const data = reportData({
			sessions: [
				session({
					id: id(1),
					start_at: at('2026-01-05T09:00Z'),
					end_at: at('2026-01-05T10:00Z'),
					note,
				}),
			],
		});
		const row = parseCsv(toCsv(sessionReport(PLAIN, data), PLAIN).slice(1))[1];
		expect(cell(row, 9)).toBe(note);
	});
});

describe('Unicode round trip (CSV)', () => {
	const NOTE = 'é vs é; 修复洗手台 👩‍💻 "quoted", a comma；「」\r\nsecond line ' + '🚀';
	const data = reportData({
		work_items: [
			workItem({ id: WORK_ITEM_A, name: '库存管理系统开发', project_id: PROJECT_A }),
			workItem({ id: WORK_ITEM_B, name: 'Beta, "q"；', project_id: null }),
		],
		projects: [project({ id: PROJECT_A, name: '第1寺院' })],
		places: [place({ id: PLACE_A, name: '修复洗手台 (dock)' })],
		sessions: [
			session({
				id: id(1),
				work_item_id: WORK_ITEM_A,
				place_id: PLACE_A,
				start_at: at('2026-01-05T09:00Z'),
				end_at: at('2026-01-05T10:00Z'),
				note: NOTE,
			}),
			session({
				id: id(2),
				work_item_id: WORK_ITEM_B,
				place_id: null,
				start_at: at('2026-01-05T11:00Z'),
				end_at: at('2026-01-05T11:20Z'),
				note: '「」；',
			}),
		],
	});
	const config = configFor(RANGE, {
		title: '报告 🚀',
		headings: { work_item: '工作项', project: '第1寺院' },
	});
	const cps = (s: string) => [...s].map((c) => c.codePointAt(0));

	it('parses back to exactly the source text, field by field', () => {
		const result = sessionReport(config, data);
		const csv = toCsv(result, config);
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		const parsed = parseCsv(csv.slice(1));
		expect(parsed).toHaveLength(result.rows.length + 1);
		expect(parsed[0]).toEqual([
			'Date',
			'Start',
			'End',
			'Duration',
			'Hours',
			'Type',
			'Counts as work',
			'第1寺院',
			'工作项',
			'Note',
			'Place',
		]);
		result.rows.forEach((source, r) => {
			const fields = parsed[r + 1];
			expect(cps(cell(fields, 7))).toEqual(cps(source.project_name ?? ''));
			expect(cps(cell(fields, 8))).toEqual(cps(source.work_item_name ?? ''));
			expect(cps(cell(fields, 9))).toEqual(cps(source.note ?? ''));
			expect(cps(cell(fields, 10))).toEqual(cps(source.place_name ?? ''));
			expect(cps(cell(fields, 5))).toEqual(cps(source.type_name));
		});
		expect(cps(cell(parsed[1], 9))).toEqual(cps(NOTE));
		expect(cps(cell(parsed[2], 8))).toEqual(cps('Beta, "q"；'));
		expect(cps(cell(parsed[1], 10))).toEqual(cps('修复洗手台 (dock)'));
	});
});

describe('csvFileName', () => {
	it('names a whole month by its month and any other range by its bounds', () => {
		expect(csvFileName(configFor({ from: '2026-11-01', to: '2026-11-30' }))).toBe(
			'hourtrail-report-2026-11.csv',
		);
		expect(reportFileBase(configFor({ from: '2026-11-02', to: '2026-11-30' }))).toBe(
			'hourtrail-report-2026-11-02-to-2026-11-30',
		);
	});
});
