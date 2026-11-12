import { describe, expect, it } from 'vitest';
import { applyMutation, schemas } from '../index';
import { isJsonValue, jsonValueSchema } from './common';

// Regression: z.json() silently dropped an own "__proto__" key (found by the
// merge idempotence property test with counterexample {"__proto__": false}).
describe('jsonValueSchema', () => {
	const tricky = JSON.parse(
		'{"__proto__": false, "constructor": {"prototype": 1}, "a": [1, "库存"]}',
	);

	it('keeps own __proto__ keys and returns the same value', () => {
		const parsed = jsonValueSchema.parse(tricky);
		expect(parsed).toBe(tricky);
		expect(Object.keys(parsed as object)).toEqual(['__proto__', 'constructor', 'a']);
		expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
	});

	it('rejects non-JSON values', () => {
		for (const bad of [undefined, NaN, Infinity, () => 1, new Date(0), new Map(), [1, undefined]])
			expect(isJsonValue(bad)).toBe(false);
		let deep: unknown = 1;
		for (let i = 0; i < 70; i++) deep = [deep];
		expect(isJsonValue(deep)).toBe(false);
	});

	it('round-trips a report preset whose config has a __proto__ key through the merge', () => {
		const preset = schemas.report_preset.parse({
			id: '00000000-0000-7000-8000-0000000000aa',
			rev: 0,
			created_at: 1,
			updated_at: 1,
			updated_by: 'device-a',
			deleted_at: null,
			name: 'Monthly',
			config: {},
		});
		const m = {
			id: '00000000-0000-7000-8000-0000000000ab',
			entity: 'report_preset' as const,
			record_id: preset.id,
			kind: 'patch' as const,
			fields: { config: { from: {}, to: tricky } },
			at: 10,
			device_id: 'device-a',
		};
		const once = applyMutation(preset, m, { now: 20 });
		expect(Object.keys((once.next as typeof preset).config as object)).toContain('__proto__');
		const twice = applyMutation(once.next, m, { now: 20 });
		expect(twice.changed).toBe(false);
		expect(twice.next).toEqual(once.next);
	});
});
