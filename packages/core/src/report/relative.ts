import { addDays, monthBounds, weekStart } from '../time';
import type { Day } from '../time';
import type { ReportConfig } from './config';

export type ResolvedRange = { from: Day; to: Day };

/**
 * The period a config covers today. A relative_range follows the calendar (weeks start on
 * `weekStartsOn`, 1 = Monday to 7 = Sunday); otherwise the stored range is used as it is.
 */
export function resolveRange(
	config: Pick<ReportConfig, 'range' | 'relative_range'>,
	today: Day,
	weekStartsOn: 1 | 2 | 3 | 4 | 5 | 6 | 7,
): ResolvedRange {
	switch (config.relative_range) {
		case null:
			return { from: config.range.from, to: config.range.to };
		case 'this_month': {
			const bounds = monthBounds(today);
			return { from: bounds.first, to: bounds.last };
		}
		case 'last_month': {
			const bounds = monthBounds(addDays(monthBounds(today).first, -1));
			return { from: bounds.first, to: bounds.last };
		}
		case 'this_week': {
			const from = weekStart(today, weekStartsOn);
			return { from, to: addDays(from, 6) };
		}
	}
}
