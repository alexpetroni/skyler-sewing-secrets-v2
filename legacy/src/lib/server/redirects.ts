/**
 * Allow only same-origin relative redirect targets. Rejects protocol-relative
 * (`//host`) and backslash (`/\host`) forms, which browsers normalize into
 * cross-origin URLs.
 */
export function safeRelativeTarget(
	to: string | null | undefined,
	fallback = '/dashboard'
): string {
	if (to && /^\/(?![/\\])/.test(to)) {
		return to;
	}
	return fallback;
}
