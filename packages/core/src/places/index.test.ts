import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Place } from '../schema';
import { chooseFix, distanceM, matchPlace, placeLabel } from './index';
import type { Fix } from './index';

const common = {
	rev: 0,
	created_at: 0,
	updated_at: 0,
	updated_by: 'device',
	deleted_at: null,
	description: '',
	archived_at: null,
};

function place(overrides: Partial<Place> = {}): Place {
	return {
		...common,
		id: '00000000-0000-7000-8000-000000000001',
		name: '第1寺院',
		lat: 0,
		lng: 0,
		radius_m: 100,
		...overrides,
	};
}

function atDistance(distance: number): Fix {
	return { lat: 0, lng: (distance / 6_371_008.8) * (180 / Math.PI), accuracy_m: 10 };
}

describe('distanceM', () => {
	it('returns zero for the same point and handles a latitude degree', () => {
		expect(distanceM({ lat: 12, lng: 34 }, { lat: 12, lng: 34 })).toBe(0);
		expect(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
	});

	it('returns the antipodal half-circumference and crosses the antimeridian', () => {
		expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(
			Math.PI * 6_371_008.8,
			6,
		);
		expect(distanceM({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeCloseTo(22_239, -1);
	});

	it('is symmetric and satisfies the triangle inequality (500 generated cases)', () => {
		const coordinate = fc.record({
			lat: fc.double({ min: -90, max: 90, noNaN: true }),
			lng: fc.double({ min: -180, max: 180, noNaN: true }),
		});
		fc.assert(
			fc.property(coordinate, coordinate, coordinate, (a, b, c) => {
				const ab = distanceM(a, b);
				const ba = distanceM(b, a);
				const ac = distanceM(a, c);
				const cb = distanceM(c, b);
				expect(Math.abs(ab - ba)).toBeLessThanOrEqual(1e-6);
				// Relative tolerance: near antipodes double-precision haversine is off by a few
				// centimetres in 20 000 km (seed 492562134 found 6.7 cm), irrelevant for places.
				expect(ab).toBeLessThanOrEqual(ac + cb + 1e-6 + 1e-8 * (ac + cb));
			}),
			{ numRuns: 500 },
		);
	});
});

describe('matchPlace', () => {
	it('sets at exactly the radius boundary when accuracy qualifies as sure', () => {
		expect(matchPlace(atDistance(100), [place()])).toMatchObject({
			state: 'set',
			place_id: place().id,
		});
	});

	it('includes the exact possible boundary and suggests when outside the radius', () => {
		const result = matchPlace(atDistance(110), [place()]);
		expect(result.state).toBe('suggested');
		if (result.state === 'suggested') expect(result.distance_m).toBeCloseTo(110, 6);
		expect(matchPlace(atDistance(110.1), [place()])).toEqual({
			state: 'unresolved',
			reason: 'no-match',
		});
	});

	it('treats 150 m as matchable and rejects accuracy above 150 m', () => {
		expect(matchPlace({ lat: 0, lng: 0, accuracy_m: 150 }, [place()]).state).toBe('suggested');
		expect(matchPlace({ lat: 0, lng: 0, accuracy_m: 150.01 }, [place()])).toEqual({
			state: 'unresolved',
			reason: 'low-accuracy',
		});
	});

	it('sets at the max(radius, 50 m) sure-accuracy boundary and suggests above it', () => {
		expect(matchPlace({ lat: 0, lng: 0, accuracy_m: 100 }, [place()]).state).toBe('set');
		expect(matchPlace({ lat: 0, lng: 0, accuracy_m: 100.01 }, [place()]).state).toBe('suggested');
		const smallRadius = place({ radius_m: 25 });
		expect(matchPlace({ lat: 0, lng: 0, accuracy_m: 50 }, [smallRadius]).state).toBe('set');
		expect(matchPlace({ lat: 0, lng: 0, accuracy_m: 50.01 }, [smallRadius]).state).toBe(
			'suggested',
		);
	});

	it('ignores archived and deleted places and reports no match when none are possible', () => {
		expect(
			matchPlace({ lat: 0, lng: 0, accuracy_m: 10 }, [
				place({ archived_at: 1 }),
				place({ id: '00000000-0000-7000-8000-000000000002', deleted_at: 1 }),
			]),
		).toEqual({ state: 'unresolved', reason: 'no-match' });
		expect(matchPlace(atDistance(500), [place()])).toEqual({
			state: 'unresolved',
			reason: 'no-match',
		});
	});

	it('returns all possible candidates nearest first, then by name and id for ties', () => {
		const candidates = [
			place({ id: '00000000-0000-7000-8000-000000000003', name: 'Beta', lng: 0.0001 }),
			place({ id: '00000000-0000-7000-8000-000000000002', name: 'Alpha', lng: -0.0001 }),
			place({ id: '00000000-0000-7000-8000-000000000004', name: 'Alpha', lng: 0.0001 }),
		];
		const result = matchPlace({ lat: 0, lng: 0, accuracy_m: 20 }, candidates);
		expect(result.state).toBe('ambiguous');
		if (result.state === 'ambiguous') {
			expect(result.candidates.map(({ place_id }) => place_id)).toEqual([
				'00000000-0000-7000-8000-000000000002',
				'00000000-0000-7000-8000-000000000004',
				'00000000-0000-7000-8000-000000000003',
			]);
		}
	});

	it('is independent of place order (500 generated cases)', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						id: fc
							.integer({ min: 1, max: 100 })
							.map((id) => `00000000-0000-7000-8000-${String(id).padStart(12, '0')}`),
						name: fc.string(),
						lng: fc.double({ min: -0.02, max: 0.02 }),
						radius_m: fc.integer({ min: 25, max: 2000 }),
						archived: fc.boolean(),
					}),
					{ maxLength: 10 },
				),
				(items) => {
					const places = items.map((item) =>
						place({
							id: item.id,
							name: item.name,
							lng: item.lng,
							radius_m: item.radius_m,
							archived_at: item.archived ? 1 : null,
						}),
					);
					const fix = { lat: 0, lng: 0, accuracy_m: 100 };
					expect(matchPlace(fix, places)).toEqual(matchPlace(fix, [...places].reverse()));
				},
			),
			{ numRuns: 500 },
		);
	});

	it('moving closer to the sole possible place never downgrades set (500 generated cases)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100 }),
				fc.integer({ min: 0, max: 50 }),
				(offset, accuracy) => {
					const target = place({ radius_m: 100 });
					const far = atDistance(offset);
					const close = atDistance(offset / 2);
					far.accuracy_m = accuracy;
					close.accuracy_m = accuracy;
					const farResult = matchPlace(far, [target]);
					const closeResult = matchPlace(close, [target]);
					if (farResult.state === 'set') expect(closeResult.state).toBe('set');
				},
			),
			{ numRuns: 500 },
		);
	});

	it('better accuracy never changes a set result to another state (500 generated cases)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100 }),
				fc.integer({ min: 0, max: 150 }),
				(offset, accuracy) => {
					const target = place({ radius_m: 100 });
					const fix = atDistance(offset);
					fix.accuracy_m = accuracy;
					if (matchPlace(fix, [target]).state === 'set') {
						fix.accuracy_m = Math.min(accuracy, 50);
						expect(matchPlace(fix, [target]).state).toBe('set');
					}
				},
			),
			{ numRuns: 500 },
		);
	});
});

describe('placeLabel and chooseFix', () => {
	it('rounds accuracy to five metres without displaying less than ±5 m', () => {
		expect(placeLabel('第1寺院', 33)).toBe('Near 第1寺院 (±35 m)');
		expect(placeLabel('Home', 0)).toBe('Near Home (±5 m)');
		expect(placeLabel('Home', 6)).toBe('Near Home (±5 m)');
	});

	it('chooses the first good fix, otherwise the most accurate fix, or null', () => {
		const first: Fix = { lat: 0, lng: 0, accuracy_m: 51 };
		const good: Fix = { lat: 1, lng: 1, accuracy_m: 50 };
		const betterLater: Fix = { lat: 2, lng: 2, accuracy_m: 5 };
		expect(chooseFix([first, good, betterLater])).toBe(good);
		expect(chooseFix([first, { ...first, accuracy_m: 70 }])).toBe(first);
		expect(chooseFix([])).toBeNull();
	});
});
