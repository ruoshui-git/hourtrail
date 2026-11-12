import { describe, expect, it } from 'vitest';
import { mapsUrl, parseCoordinates, referenceCount } from './domain';

describe('place helpers', () => {
	it('parses decimal coordinates and pasted pairs', () => {
		expect(parseCoordinates('45.123')).toBeNull();
		expect(parseCoordinates('45.123, -73.456')).toEqual({ lat: 45.123, lng: -73.456 });
		expect(parseCoordinates('-90,180')).toEqual({ lat: -90, lng: 180 });
	});
	it('rejects comma decimals and out of range coordinates', () => {
		expect(parseCoordinates('45,123, -73.456')).toBeNull();
		expect(parseCoordinates('91,0')).toBeNull();
		expect(parseCoordinates('0,-181')).toBeNull();
	});
	it('creates an Apple Maps URL', () => {
		expect(mapsUrl({ lat: 45.123, lng: -73.456 })).toBe(
			'https://maps.apple.com/?ll=45.123,-73.456',
		);
	});
	it('counts session and work item references', () => {
		expect(referenceCount('p', [{ place_id: 'p' }, { place_id: null }], [{ place_id: 'p' }])).toBe(
			2,
		);
	});
});
