import { csvFileName, reportFileBase, toCsv } from '@hourtrail/core';
import type { Report, ReportConfig } from '@hourtrail/core';
import { deliverBackup } from '$lib/features/backup/export';
import { toXlsx } from './xlsx';

const CSV_TYPE = 'text/csv;charset=utf-8';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Saves or shares the CSV; resolves false only when the share sheet was dismissed. */
export function downloadCsv(report: Report, config: ReportConfig): Promise<boolean> {
	const file = new File([toCsv(report, config)], csvFileName(config), { type: CSV_TYPE });
	return deliverBackup(file);
}

/** Saves or shares the workbook; resolves false only when the share sheet was dismissed. */
export async function downloadXlsx(report: Report, config: ReportConfig): Promise<boolean> {
	const blob = await toXlsx(report, config);
	const file = new File([blob], `${reportFileBase(config)}.xlsx`, { type: XLSX_TYPE });
	return deliverBackup(file);
}
