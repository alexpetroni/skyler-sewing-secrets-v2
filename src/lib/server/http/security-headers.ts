/**
 * Baseline security headers on every response. Headers are only set when
 * absent so a route can still override one deliberately. The Content Security
 * Policy is SvelteKit's (nonce mode, `csp` in vite.config.ts) and passes
 * through untouched; `X-Frame-Options: DENY` is kept alongside its
 * `frame-ancestors 'none'` for clients that predate CSP level 2.
 * Permissions-Policy leaves autoplay, fullscreen and picture-in-picture alone
 * because the lesson player's iframe uses them.
 */
export function withSecurityHeaders(response: Response, url: URL): Response {
	const headers = response.headers;
	const setIfAbsent = (name: string, value: string) => {
		if (!headers.has(name)) headers.set(name, value);
	};

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
