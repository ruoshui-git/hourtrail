import type { PushSubscribeRequest } from '@hourtrail/core';

const encoder = new TextEncoder();
export function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}
export function decodeBase64url(value: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}
async function hkdf(ikm: ArrayBuffer, salt: Uint8Array, info: Uint8Array, bits: number) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits);
}

/** RFC 8291 §3 / RFC 8188 §2: one record, fresh ECDH key and salt for every message. */
export async function encryptWebPush(message: string, keys: PushSubscribeRequest['keys']) {
	const plaintext = encoder.encode(message);
	// 4096-byte push-service minimum, less the 86-byte header, delimiter and GCM tag.
	if (plaintext.length > 3993) throw new RangeError('Push payload exceeds 3993 bytes');
	const client = decodeBase64url(keys.p256dh);
	const auth = decodeBase64url(keys.auth);
	if (client.length !== 65 || client[0] !== 4 || auth.length !== 16) {
		throw new Error('Invalid push subscription keys');
	}
	const publicKey = await crypto.subtle.importKey(
		'raw',
		client,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[],
	);
	const server = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits',
	])) as CryptoKeyPair;
	const serverPublic = new Uint8Array(
		(await crypto.subtle.exportKey('raw', server.publicKey)) as ArrayBuffer,
	);
	// workers-types misnames the standard `public` member as `$public`.
	const exchange = { name: 'ECDH', public: publicKey };
	const secret = await crypto.subtle.deriveBits(exchange, server.privateKey, 256);
	const ikm = await hkdf(
		secret,
		auth,
		concat(encoder.encode('WebPush: info\0'), client, serverPublic),
		256,
	);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const [keyBytes, nonce] = await Promise.all([
		hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 128),
		hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 96),
	]);
	const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce },
		key,
		concat(plaintext, new Uint8Array([2])),
	);
	const header = new Uint8Array(21);
	header.set(salt);
	new DataView(header.buffer).setUint32(16, 4096); // Network byte order.
	header[20] = serverPublic.length;
	return concat(header, serverPublic, new Uint8Array(ciphertext));
}

/** RFC 8292: reuse the signing key and one 12-hour JWT per service origin within this run. */
export async function createPushSender(
	publicKey: string,
	privateJwk: string,
	appOrigin: string,
	now: number,
) {
	const origin = new URL(appOrigin);
	if (origin.protocol !== 'https:' || origin.origin !== appOrigin)
		throw new Error('Invalid app origin');
	const key = await crypto.subtle.importKey(
		'jwk',
		JSON.parse(privateJwk) as JsonWebKey,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign'],
	);
	const authorizations = new Map<string, Promise<string>>();
	async function authorization(aud: string): Promise<string> {
		const unsigned = `${base64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${base64url(encoder.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: appOrigin })))}`;
		const signature = await crypto.subtle.sign(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			encoder.encode(unsigned),
		);
		return `vapid t=${unsigned}.${base64url(new Uint8Array(signature))}, k=${publicKey}`;
	}
	return async (subscription: PushSubscribeRequest, payload: unknown): Promise<Response> => {
		const service = new URL(subscription.endpoint);
		if (service.protocol !== 'https:') throw new Error('Push endpoint must use HTTPS');
		let auth = authorizations.get(service.origin);
		if (!auth) {
			auth = authorization(service.origin);
			authorizations.set(service.origin, auth);
		}
		const [body, signed] = await Promise.all([
			encryptWebPush(JSON.stringify(payload), subscription.keys),
			auth,
		]);
		return fetch(subscription.endpoint, {
			method: 'POST',
			redirect: 'manual',
			body,
			headers: {
				Authorization: signed,
				'Content-Encoding': 'aes128gcm',
				'Content-Type': 'application/octet-stream',
				TTL: '3600',
				Urgency: 'normal',
			},
		});
	};
}
