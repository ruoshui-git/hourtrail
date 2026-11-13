import { formatHours } from '@hourtrail/core';

export type DurationFormat = 'hm' | 'decimal';

/** Format whole minutes consistently across UI surfaces. */
export function formatMinutes(total: number, format: DurationFormat = 'hm'): string {
	return formatHours(Math.max(0, Math.round(total)), format);
}
