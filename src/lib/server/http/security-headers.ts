/**
 * Standard headers on every response: `X-Request-Id` plus the baseline
 * security headers. Headers are only set when
 * absent so a route can still override one deliberately. The Content Security
 * Policy is SvelteKit's (nonce mode, `csp` in vite.config.ts) and passes
 * through untouched; `X-Frame-Options: DENY` is kept alongside its
 * `frame-ancestors 'none'` for clients that predate CSP level 2.
 * Permissions-Policy leaves autoplay, fullscreen and picture-in-picture alone
 * because the lesson player's iframe uses them.
 */
export function withStandardHeaders(response: Response, url: URL, requestId: string): Response {
	const headers = response.headers;
	const setIfAbsent = (name: string, value: string) => {
		if (!headers.has(name)) headers.set(name, value);
	};

	headers.set('X-Request-Id', requestId);
	setIfAbsent('X-Content-Type-Options', 'nosniff');
	setIfAbsent('Referrer-Policy', 'strict-origin-when-cross-origin');
	setIfAbsent('X-Frame-Options', 'DENY');
	setIfAbsent('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	// HSTS is only meaningful (and only safe) over https
	if (url.protocol === 'https:') {
		setIfAbsent('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
}
