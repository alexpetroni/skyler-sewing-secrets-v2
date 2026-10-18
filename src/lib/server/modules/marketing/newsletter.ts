import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { schema, type Db } from '#lib/server/db/index.ts';
import type { Logger, Mailer } from '#lib/server/platform/index.ts';
import { csvCell, toCsv } from '../csv.ts';
import { newsletterConfirmEmail, newsletterWelcomeEmail } from './emails.ts';

const { newsletter_subscribers } = schema;

export type Subscriber = typeof newsletter_subscribers.$inferSelect;

export interface NewsletterService {
	/**
	 * Double opt-in: a confirmed, active address is left alone and gets no
	 * mail; anything else becomes (or stays) an unconfirmed, inactive row with
	 * a fresh confirmation token, and the confirmation email is sent.
	 */
	requestSubscription(
		email: string
	): Promise<{ status: 'confirmation_sent' | 'already_subscribed' }>;
	/** Activates the row the token belongs to and sends the welcome email; false for an unknown token. */
	confirm(token: string): Promise<boolean>;
	/** HMAC-SHA256 of the lower-cased address, hex (the legacy token, so old links keep working). */
	unsubscribeToken(email: string): string;
	verifyUnsubscribeToken(email: string, token: string): boolean;
	unsubscribeUrl(email: string): string;
	/** Deactivates the address when the token is valid; idempotent. False for an invalid link. */
	unsubscribe(email: string, token: string): Promise<boolean>;
	/** Admin: every row, newest first. */
	list(): Promise<Subscriber[]>;
	/** Admin: every row as CSV, each cell quoted and formula-neutralised (security audit L3). */
	exportCsv(): Promise<string>;
}

export interface NewsletterDeps {
	db: Db;
	mailer: Mailer;
	log: Logger;
	siteUrl: string;
	/** Key for the unsubscribe HMAC (`BETTER_AUTH_SECRET`, as legacy). */
	secret: string;
	now: () => Date;
}

const CONFIRM_TOKEN_BYTES = 32;
// 32 bytes in base64url.
const CONFIRM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normaliseEmail(email: string): string {
	return email.trim().toLowerCase();
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Re-exported for the module's public API; the quoting rules live in `../csv.ts`. */
export { csvCell, toCsv };

export const CSV_HEADER = [
	'email',
	'is_active',
	'confirmed_at',
	'subscribed_at',
	'unsubscribed_at'
] as const;

export function createNewsletterService(deps: NewsletterDeps): NewsletterService {
	const { db, mailer, log, siteUrl, secret, now } = deps;

	function unsubscribeToken(email: string): string {
		if (!secret) throw new Error('The newsletter unsubscribe secret is not set');
		return createHmac('sha256', secret).update(normaliseEmail(email)).digest('hex');
	}

	/** Constant-time: the comparison never short-circuits on the first differing byte. */
	function verifyUnsubscribeToken(email: string, token: string): boolean {
		const expected = Buffer.from(unsubscribeToken(email));
		const given = Buffer.from(token);
		if (given.length !== expected.length) return false;
		return timingSafeEqual(given, expected);
	}

	function list(): Promise<Subscriber[]> {
		return db
			.select()
			.from(newsletter_subscribers)
			.orderBy(desc(newsletter_subscribers.subscribed_at));
	}

	function unsubscribeUrl(email: string): string {
		const address = normaliseEmail(email);
		return `${siteUrl}/newsletter/unsubscribe?email=${encodeURIComponent(address)}&token=${unsubscribeToken(address)}`;
	}

	return {
		unsubscribeToken,
		verifyUnsubscribeToken,
		unsubscribeUrl,

		async requestSubscription(rawEmail) {
			const email = normaliseEmail(rawEmail);
			const [existing] = await db
				.select({
					is_active: newsletter_subscribers.is_active,
					confirmed_at: newsletter_subscribers.confirmed_at
				})
				.from(newsletter_subscribers)
				.where(eq(newsletter_subscribers.email, email))
				.limit(1);
			if (existing?.is_active && existing.confirmed_at) return { status: 'already_subscribed' };

			// A legacy row (active, never confirmed) or a lapsed one is moved back
			// to pending: it only becomes active again through `confirm`.
			const token = randomBytes(CONFIRM_TOKEN_BYTES).toString('base64url');
			const pending = {
				is_active: false,
				confirmed_at: null,
				confirm_token_hash: hashToken(token),
				subscribed_at: now().toISOString()
			};
			const [row] = await db
				.insert(newsletter_subscribers)
				.values({ email, ...pending })
				.onConflictDoUpdate({ target: newsletter_subscribers.email, set: pending })
				.returning({ id: newsletter_subscribers.id });

			const confirmUrl = `${siteUrl}/newsletter/confirm?token=${token}`;
			await mailer.send({ to: email, ...newsletterConfirmEmail(confirmUrl, siteUrl) });
			log.info('newsletter confirmation sent', { subscriberId: row.id });
			return { status: 'confirmation_sent' };
		},

		async confirm(token) {
			if (!CONFIRM_TOKEN_PATTERN.test(token)) return false;
			const at = now().toISOString();
			const [row] = await db
				.update(newsletter_subscribers)
				.set({
					is_active: true,
					confirmed_at: at,
					confirm_token_hash: null,
					unsubscribed_at: null
				})
				.where(eq(newsletter_subscribers.confirm_token_hash, hashToken(token)))
				.returning({ id: newsletter_subscribers.id, email: newsletter_subscribers.email });
			if (!row) return false;
			log.info('newsletter subscription confirmed', { subscriberId: row.id });

			// The subscription stands even if the welcome email cannot be sent.
			try {
				await mailer.send({
					to: row.email,
					...newsletterWelcomeEmail(unsubscribeUrl(row.email), siteUrl)
				});
			} catch (err) {
				log.error('newsletter welcome email failed', {
					subscriberId: row.id,
					error: err instanceof Error ? err.message : String(err)
				});
			}
			return true;
		},

		async unsubscribe(rawEmail, token) {
			const email = normaliseEmail(rawEmail);
			if (!email || !token || !verifyUnsubscribeToken(email, token)) return false;
			// An unknown or already inactive address matches zero rows (or rewrites
			// the same state) and still counts as unsubscribed.
			const rows = await db
				.update(newsletter_subscribers)
				.set({ is_active: false, unsubscribed_at: now().toISOString(), confirm_token_hash: null })
				.where(eq(newsletter_subscribers.email, email))
				.returning({ id: newsletter_subscribers.id });
			for (const row of rows) log.info('newsletter unsubscribed', { subscriberId: row.id });
			return true;
		},

		list,

		async exportCsv() {
			const rows = await list();
			return toCsv([
				CSV_HEADER,
				...rows.map((row) => [
					row.email,
					row.is_active,
					row.confirmed_at,
					row.subscribed_at,
					row.unsubscribed_at
				])
			]);
		}
	};
}
