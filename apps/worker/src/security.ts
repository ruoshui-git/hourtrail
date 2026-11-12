/**
 * Security headers (docs/SPEC.md, "Authentication and security"). The Worker applies
 * them to /api/* responses; scripts/write-headers.mjs writes the same set into the
 * static assets' _headers file, adding the hash of the SPA's inline boot script.
 */
export function contentSecurityPolicy(scriptHashes: readonly string[] = []): string {
	const scripts = ["'self'", ...scriptHashes.map((h) => `'${h}'`)].join(' ');
	return [
		"default-src 'self'",
		`script-src ${scripts}`,
		// Inline style attributes (custom properties, positioning) are allowed; inline script is not.
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		"connect-src 'self'",
		"manifest-src 'self'",
		"worker-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join('; ');
}

export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
	'Cross-Origin-Opener-Policy': 'same-origin',
};

export function apiHeaders(): Headers {
	const h = new Headers(BASE_SECURITY_HEADERS);
	h.set('Content-Security-Policy', contentSecurityPolicy());
	h.set('Cache-Control', 'no-store');
	h.set('Content-Type', 'application/json; charset=utf-8');
	return h;
}
