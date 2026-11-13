// Receiver-side derivation uses explicit HMAC extract/expand, independently of
// the sender's WebCrypto HKDF calls (RFC 8291 §3.4).
export function encode64(value: Uint8Array): string {
	return btoa(String.fromCharCode(...value))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}
export function decode64(value: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
export async function subscriptionKeys() {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits',
	])) as CryptoKeyPair;
	const publicKey = new Uint8Array(
		(await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
	);
	const auth = crypto.getRandomValues(new Uint8Array(16));
	return { pair, publicKey, auth, keys: { p256dh: encode64(publicKey), auth: encode64(auth) } };
}
export async function vapidKeys() {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify',
	])) as CryptoKeyPair;
	return {
		pair,
		publicKey: encode64(
			new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
		),
		privateKey: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
	};
}

async function hmac(keyBytes: Uint8Array, ...data: Uint8Array[]) {
	const key = await crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const bytes = new Uint8Array(data.flatMap((part) => [...part]));
	return new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
}

export async function decryptPush(
	body: ArrayBuffer,
	receiver: Awaited<ReturnType<typeof subscriptionKeys>>,
) {
	const bytes = new Uint8Array(body);
	const salt = bytes.slice(0, 16);
	const recordSize = new DataView(body).getUint32(16);
	const keyLength = bytes[20]!;
	if (keyLength !== 65 || bytes.length - 21 - keyLength > recordSize)
		throw new Error('Invalid aes128gcm header');
	const serverPublic = bytes.slice(21, 21 + keyLength);
	const serverKey = await crypto.subtle.importKey(
		'raw',
		serverPublic,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[],
	);
	const exchange = { name: 'ECDH', public: serverKey };
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits(exchange, receiver.pair.privateKey, 256),
	);
	const encoder = new TextEncoder();
	const prkKey = await hmac(receiver.auth, shared);
	const ikm = await hmac(
		prkKey,
		encoder.encode('WebPush: info\0'),
		receiver.publicKey,
		serverPublic,
		new Uint8Array([1]),
	);
	const prk = await hmac(salt, ikm);
	const cek = (
		await hmac(prk, encoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1]))
	).slice(0, 16);
	const nonce = (
		await hmac(prk, encoder.encode('Content-Encoding: nonce\0'), new Uint8Array([1]))
	).slice(0, 12);
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
	const plaintext = new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, bytes.slice(21 + keyLength)),
	);
	if (plaintext.at(-1) !== 2) throw new Error('Missing final record delimiter');
	return new TextDecoder().decode(plaintext.slice(0, -1));
}
