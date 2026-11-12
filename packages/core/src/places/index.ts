import type { RecordOf } from '../schema';

export type Fix = { lat: number; lng: number; accuracy_m: number };

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres, using the haversine formula. */
export function distanceM(
	a: { lat: number; lng: number },
	b: { lat: number; lng: number },
): number {
	const radians = Math.PI / 180;
	const latA = a.lat * radians;
	const latB = b.lat * radians;
	const deltaLat = (b.lat - a.lat) * radians;
	const deltaLng = (b.lng - a.lng) * radians;
	const haversine =
		Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export const MAX_MATCH_ACCURACY_M = 150;
export const GOOD_FIX_ACCURACY_M = 50;

export type PlaceMatch =
	| { state: 'set'; place_id: string; distance_m: number }
	| { state: 'suggested'; place_id: string; distance_m: number }
	| { state: 'ambiguous'; candidates: { place_id: string; distance_m: number }[] }
	| { state: 'unresolved'; reason: 'low-accuracy' | 'no-match' };

export function matchPlace(fix: Fix, places: RecordOf<'place'>[]): PlaceMatch {
	if (fix.accuracy_m > MAX_MATCH_ACCURACY_M) {
		return { state: 'unresolved', reason: 'low-accuracy' };
	}

	const possible = places
		.filter((place) => place.archived_at === null && place.deleted_at === null)
		.map((place) => ({
			place,
			distance_m: distanceM(fix, { lat: place.lat, lng: place.lng }),
		}))
		.filter(({ place, distance_m }) => distance_m <= place.radius_m + fix.accuracy_m)
		.sort(
			(a, b) =>
				a.distance_m - b.distance_m ||
				(a.place.name < b.place.name ? -1 : a.place.name > b.place.name ? 1 : 0) ||
				(a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0),
		);

	if (possible.length === 0) return { state: 'unresolved', reason: 'no-match' };
	if (possible.length > 1) {
		return {
			state: 'ambiguous',
			candidates: possible.map(({ place, distance_m }) => ({ place_id: place.id, distance_m })),
		};
	}

	const match = possible[0]!;
	const sure =
		match.distance_m <= match.place.radius_m &&
		fix.accuracy_m <= Math.max(match.place.radius_m, GOOD_FIX_ACCURACY_M);
	return {
		state: sure ? 'set' : 'suggested',
		place_id: match.place.id,
		distance_m: match.distance_m,
	};
}

/** Format a place name with an accuracy radius rounded to the nearest five metres. */
export function placeLabel(name: string, accuracy_m: number): string {
	const roundedAccuracy = Math.max(5, Math.round(accuracy_m / 5) * 5);
	return `Near ${name} (±${roundedAccuracy} m)`;
}

/** Select the first good fix, or the most accurate fix if none meets the good threshold. */
export function chooseFix(fixes: Fix[]): Fix | null {
	return (
		fixes.find((fix) => fix.accuracy_m <= GOOD_FIX_ACCURACY_M) ??
		fixes.reduce<Fix | null>(
			(best, fix) => (best === null || fix.accuracy_m < best.accuracy_m ? fix : best),
			null,
		)
	);
}
