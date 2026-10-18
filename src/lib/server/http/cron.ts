import { timingSafeEqual } from 'node:crypto';

/**
 * Whether the request carries `Authorization: Bearer <secret>`, as Vercel
 * cron sends it. The comparison is constant-time.
 */
export function isCronAuthorised(request: Request, secret: string): boolean {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(\S+)$/.exec(header);
	if (!match || secret.length === 0) return false;
	const presented = Buffer.from(match[1]);
	const expected = Buffer.from(secret);
	return presented.length === expected.length && timingSafeEqual(presented, expected);
}
