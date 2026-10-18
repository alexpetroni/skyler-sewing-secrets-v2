import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.ts';
import { request_limits } from '#lib/server/db/schema/ops.ts';

export interface LimitRule {
	max: number;
	windowSeconds: number;
}

export interface LimitResult {
	allowed: boolean;
	/** Requests left in the current window. */
	remaining: number;
	/** Seconds until the window resets; 0 when allowed. */
	retryAfterSeconds: number;
}

export interface RequestLimiter {
	consume(key: string, rule: LimitRule): Promise<LimitResult>;
}

export interface RequestLimiterOptions {
	db: Db;
	/** Injectable clock for tests. */
	now?: () => Date;
}

/**
 * Fixed-window limiter on `request_limits`, safe on serverless because the
 * counter lives in Postgres: one upsert increments the counter, or restarts
 * the window when it is older than `windowSeconds`, and returns the result.
 */
export function createRequestLimiter(options: RequestLimiterOptions): RequestLimiter {
	const { db, now = () => new Date() } = options;
	const table = sql.identifier('request_limits');

	return {
		async consume(key, { max, windowSeconds }) {
			const at = now();
			const nowParam = sql`${at.toISOString()}::timestamptz`;
			const expired = sql`${table}.${sql.identifier('window_start')} <= ${nowParam} - make_interval(secs => ${windowSeconds})`;

			const [row] = await db
				.insert(request_limits)
				.values({ key, count: 1, window_start: at.toISOString() })
				.onConflictDoUpdate({
					target: request_limits.key,
					set: {
						count: sql`CASE WHEN ${expired} THEN 1 ELSE ${table}.${sql.identifier('count')} + 1 END`,
						window_start: sql`CASE WHEN ${expired} THEN ${nowParam} ELSE ${table}.${sql.identifier('window_start')} END`
					}
				})
				.returning({
					count: request_limits.count,
					windowStartMs: sql<number>`(extract(epoch from ${request_limits.window_start}) * 1000)::float8`
				});

			const allowed = row.count <= max;
			const resetsAtMs = Number(row.windowStartMs) + windowSeconds * 1000;
			return {
				allowed,
				remaining: Math.max(0, max - row.count),
				retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetsAtMs - at.getTime()) / 1000))
			};
		}
	};
}

/**
 * A limiter key for `prefix` (the scope, e.g. `contact`) and the client: the
 * IP is hashed so `request_limits` never stores a raw address. When the
 * adapter cannot tell the address, every such client shares one bucket.
 */
export function keyFor(prefix: string, event: { getClientAddress(): string }): string {
	let address: string;
	try {
		address = event.getClientAddress();
	} catch {
		address = 'unknown';
	}
	return hashedKey(prefix, address);
}

/** A limiter key for `prefix` and a hashed `value` (an email, an address): the table never sees the value. */
export function hashedKey(prefix: string, value: string): string {
	return `${prefix}:${createHash('sha256').update(value).digest('hex')}`;
}
