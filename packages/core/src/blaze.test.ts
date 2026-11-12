import { describe, expect, it } from 'vitest';
import { BLAZE_KEYS, isBlazeKey } from './blaze';

describe('blaze keys', () => {
	it('has the ten design-system keys in order', () => {
		expect(BLAZE_KEYS).toEqual([
			'lake',
			'saffron',
			'fern',
			'rowan',
			'heather',
			'spruce',
			'rose',
			'lichen',
			'slate',
			'bark',
		]);
	});

	it('recognises keys', () => {
		expect(isBlazeKey('lake')).toBe(true);
		expect(isBlazeKey('red')).toBe(false);
		expect(isBlazeKey(3)).toBe(false);
	});
});
