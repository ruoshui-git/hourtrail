/** Format a whole number of minutes as `2h 14m` (list style, see DESIGN_SYSTEM Voice). */
export function formatMinutes(total: number): string {
	const h = Math.floor(total / 60);
	const m = total % 60;
	return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
