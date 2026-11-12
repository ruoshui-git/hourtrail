export type Coordinates = { lat: number; lng: number };

export function parseCoordinates(input: string): Coordinates | null {
	const parts = input.trim().split(/\s*,\s*/);
	if (parts.length !== 2 || !parts.every((part) => /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(part)))
		return null;
	const lat = Number(parts[0]);
	const lng = Number(parts[1]);
	if (
		!Number.isFinite(lat) ||
		!Number.isFinite(lng) ||
		lat < -90 ||
		lat > 90 ||
		lng < -180 ||
		lng > 180
	)
		return null;
	return { lat, lng };
}

export function mapsUrl({ lat, lng }: Coordinates): string {
	return `https://maps.apple.com/?ll=${lat},${lng}`;
}

export function referenceCount(
	placeId: string,
	sessions: { place_id: string | null }[],
	items: { place_id: string | null }[],
): number {
	return (
		sessions.filter((row) => row.place_id === placeId).length +
		items.filter((row) => row.place_id === placeId).length
	);
}
