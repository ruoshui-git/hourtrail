const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_TIMESTAMP = 0xffffffffffff;
const MAX_RANDOM = (1n << 74n) - 1n;
let lastTimestamp = -1;
let counter = 0n;

function randomBytes(length: number): Uint8Array {
	// Web Crypto is shared by browsers, Workers and Node; core has no DOM typings.
	const { crypto } = globalThis as unknown as {
		crypto: { getRandomValues(bytes: Uint8Array): Uint8Array };
	};
	return crypto.getRandomValues(new Uint8Array(length));
}

/** RFC 9562 UUIDv7, with a monotonic counter across the 74 available random bits. */
export function newId(now = Date.now(), random = randomBytes): string {
	if (!Number.isSafeInteger(now) || now < 0 || now > MAX_TIMESTAMP) {
		throw new RangeError('UUIDv7 timestamp must fit in 48 bits');
	}
	const timestamp = Math.max(now, lastTimestamp);
	let next: bigint;
	if (timestamp === lastTimestamp) {
		next = counter + 1n;
		if (next > MAX_RANDOM) throw new RangeError('UUIDv7 counter exhausted');
	} else {
		const bytes = random(10);
		if (bytes.length !== 10) throw new RangeError('Random source must return 10 bytes');
		next = bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
		// RFC 9562 method 1: start the high counter bits at zero, retaining 62 random bits.
		next &= (1n << 62n) - 1n;
	}
	lastTimestamp = timestamp;
	counter = next;
	const hex = (
		(BigInt(timestamp) << 80n) |
		(7n << 76n) |
		((next >> 62n) << 64n) |
		(2n << 62n) |
		(next & ((1n << 62n) - 1n))
	)
		.toString(16)
		.padStart(32, '0');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Any UUID version, in lowercase hyphenated form (including nil and max UUIDs). */
export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}

export function idTimestamp(id: string): number | null {
	return isUuid(id) && id[14] === '7' && /^[89ab]$/.test(id[19]!)
		? Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)
		: null;
}
