/** The ten blaze colour keys an activity type can take (docs/DESIGN_SYSTEM.md, "Colour tokens"). */
export const BLAZE_KEYS = [
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
] as const;

export type BlazeKey = (typeof BLAZE_KEYS)[number];

export function isBlazeKey(value: unknown): value is BlazeKey {
	return typeof value === 'string' && (BLAZE_KEYS as readonly string[]).includes(value);
}
