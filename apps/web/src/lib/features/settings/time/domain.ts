/** Match zone names while treating spaces, underscores, and slashes alike. */
export function normalizeZoneSearch(value: string): string {
	return value
		.toLocaleLowerCase()
		.replace(/[\s/_]+/g, ' ')
		.trim();
}

export function searchZones(zones: readonly string[], query: string): string[] {
	const needle = normalizeZoneSearch(query);
	if (!needle) return [...zones];
	return zones.filter((zone) => normalizeZoneSearch(zone).includes(needle));
}

/** Format a zone's offset at the current instant as UTC±HH:MM. */
export function formatZoneOffset(zone: string, at = Date.now()): string {
	const part = new Intl.DateTimeFormat('en', {
		timeZone: zone,
		timeZoneName: 'longOffset',
	})
		.formatToParts(at)
		.find((item) => item.type === 'timeZoneName')?.value;
	if (!part || part === 'GMT' || part === 'GMT+00:00' || part === 'GMT-00:00') return 'UTC+00:00';
	return part.replace(/^GMT/, 'UTC');
}
