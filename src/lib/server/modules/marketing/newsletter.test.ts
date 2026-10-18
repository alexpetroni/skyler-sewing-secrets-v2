import { createHash, createHmac } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import {
	createTestServices,
	TEST_AUTH_SECRET,
	TEST_SITE_URL
} from '../../../../../tests/helpers/services.ts';
import { schema } from '#lib/server/db/index.ts';
import { createFakeLogger } from '#lib/server/platform/fakes/logger.ts';
import { createFakeMailer } from '#lib/server/platform/fakes/mailer.ts';
import type { Mailer } from '#lib/server/platform/index.ts';
import { createNewsletterService, csvCell, toCsv } from './newsletter.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { newsletter_subscribers } = schema;

const EMAIL = 'reader@example.com';
const HEX_64 = /^[0-9a-f]{64}$/;
const START = new Date('2026-10-01T09:00:00.000Z');

describe('newsletter service', () => {
	const { db } = useTestDb();

	function setup() {
		let clock = START;
		const services = createTestServices(db(), { now: () => clock });
		return {
			...services,
			newsletter: services.marketing.newsletter,
			advance(ms: number) {
				clock = new Date(clock.getTime() + ms);
			}
		};
	}

	async function rowFor(email: string) {
		const [row] = await db()
			.select()
			.from(newsletter_subscribers)
			.where(eq(newsletter_subscribers.email, email));
		return row;
	}

	/** The DoD invariant: no row is active without a confirmation. */
	async function activeUnconfirmedCount(): Promise<number> {
		const result = await db().execute<{ count: number }>(
			sql`SELECT count(*)::int AS count FROM newsletter_subscribers WHERE is_active AND confirmed_at IS NULL`
		);
		return result.rows[0].count;
	}

	function tokenFrom(confirmMailText: string): string {
		const match = /\/newsletter\/confirm\?token=([A-Za-z0-9_-]+)/.exec(confirmMailText);
		if (!match) throw new Error('confirmation mail carries no confirm link');
		return match[1];
	}

	describe('requestSubscription', () => {
		it('creates an unconfirmed, inactive row with a hashed token and sends only the confirm mail', async () => {
			const { newsletter, mailer } = setup();

			expect(await newsletter.requestSubscription('  Reader@Example.com ')).toEqual({
				status: 'confirmation_sent'
			});

			const row = await rowFor(EMAIL);
			expect(row).toMatchObject({
				email: EMAIL,
				is_active: false,
				confirmed_at: null,
				subscribed_at: '2026-10-01 09:00:00+00'
			});
			expect(row.confirm_token_hash).toMatch(HEX_64);
			expect(await activeUnconfirmedCount()).toBe(0);

			expect(mailer.sent).toHaveLength(1);
			const mail = mailer.sent[0];
			expect(mail.to).toBe(EMAIL);
			expect(mail.subject).toMatch(/^Confirm your subscription/);
			const token = tokenFrom(mail.text);
			expect(mail.text).toContain(`${TEST_SITE_URL}/newsletter/confirm?token=${token}`);
			// Only the hash is stored, never the token itself.
			expect(row.confirm_token_hash).toBe(createHash('sha256').update(token).digest('hex'));
			expect(row.confirm_token_hash).not.toBe(token);
		});

		it('sends nothing and changes nothing for an address that is already confirmed', async () => {
			const { newsletter, mailer } = setup();
			await newsletter.requestSubscription(EMAIL);
			expect(await newsletter.confirm(tokenFrom(mailer.sent[0].text))).toBe(true);
			const confirmed = await rowFor(EMAIL);
			expect(mailer.sent).toHaveLength(2);

			expect(await newsletter.requestSubscription(EMAIL)).toEqual({
				status: 'already_subscribed'
			});

			expect(mailer.sent).toHaveLength(2);
			expect(await rowFor(EMAIL)).toEqual(confirmed);
		});

		it('moves a legacy active-but-unconfirmed row back to pending instead of trusting it', async () => {
			const { newsletter, mailer } = setup();
			await db().insert(newsletter_subscribers).values({ email: EMAIL, is_active: true });

			await newsletter.requestSubscription(EMAIL);

			expect(await rowFor(EMAIL)).toMatchObject({ is_active: false, confirmed_at: null });
			expect(mailer.sent).toHaveLength(1);
			expect(mailer.sent[0].subject).toMatch(/^Confirm/);
		});

		it('replaces the token on a repeated request, so only the newest link confirms', async () => {
			const { newsletter, mailer } = setup();
			await newsletter.requestSubscription(EMAIL);
			await newsletter.requestSubscription(EMAIL);
			const [first, second] = mailer.sent.map((mail) => tokenFrom(mail.text));
			expect(first).not.toBe(second);

			expect(await newsletter.confirm(first)).toBe(false);
			expect(await newsletter.confirm(second)).toBe(true);
		});

		it('requires a fresh confirmation after an unsubscribe', async () => {
			const { newsletter, mailer } = setup();
			await newsletter.requestSubscription(EMAIL);
			await newsletter.confirm(tokenFrom(mailer.sent[0].text));
			await newsletter.unsubscribe(EMAIL, newsletter.unsubscribeToken(EMAIL));

			expect(await newsletter.requestSubscription(EMAIL)).toEqual({ status: 'confirmation_sent' });
			expect(await rowFor(EMAIL)).toMatchObject({ is_active: false, confirmed_at: null });
			expect(mailer.sent.map((mail) => mail.subject.split(' ')[0])).toEqual([
				'Confirm',
				'Welcome',
				'Confirm'
			]);
		});
	});

	describe('confirm', () => {
		it('activates the row, clears the hash and sends the welcome mail with a working unsubscribe link', async () => {
			const { newsletter, mailer, advance } = setup();
			await newsletter.requestSubscription(EMAIL);
			const token = tokenFrom(mailer.sent[0].text);
			advance(60_000);

			expect(await newsletter.confirm(token)).toBe(true);

			expect(await rowFor(EMAIL)).toMatchObject({
				is_active: true,
				confirmed_at: '2026-10-01 09:01:00+00',
				confirm_token_hash: null,
				unsubscribed_at: null
			});
			expect(await activeUnconfirmedCount()).toBe(0);

			// Exactly one confirm mail and one welcome mail, the welcome only now.
			expect(mailer.sent).toHaveLength(2);
			const welcome = mailer.sent[1];
			expect(welcome.to).toBe(EMAIL);
			expect(welcome.subject).toBe("Welcome to Couture Notes - Skyler's Sewing Secrets");

			const link = /(https?:\/\/\S+\/newsletter\/unsubscribe\?\S+)/.exec(welcome.text)?.[1];
			if (!link) throw new Error('welcome mail carries no unsubscribe link');
			const url = new URL(link);
			expect(`${url.origin}${url.pathname}`).toBe(`${TEST_SITE_URL}/newsletter/unsubscribe`);
			expect(url.searchParams.get('email')).toBe(EMAIL);
			const unsubscribeToken = url.searchParams.get('token') ?? '';
			expect(newsletter.verifyUnsubscribeToken(EMAIL, unsubscribeToken)).toBe(true);
			expect(link).toBe(newsletter.unsubscribeUrl(EMAIL));
		});

		it('rejects unknown, malformed, empty and already used tokens without sending mail', async () => {
			const { newsletter, mailer } = setup();
			await newsletter.requestSubscription(EMAIL);
			const token = tokenFrom(mailer.sent[0].text);
			const unknown = Buffer.alloc(32, 7).toString('base64url');

			expect(await newsletter.confirm(unknown)).toBe(false);
			expect(await newsletter.confirm('not a token')).toBe(false);
			expect(await newsletter.confirm('')).toBe(false);
			// The stored hash itself is not a token.
			expect(await newsletter.confirm((await rowFor(EMAIL)).confirm_token_hash ?? '')).toBe(false);
			expect(await rowFor(EMAIL)).toMatchObject({ is_active: false, confirmed_at: null });
			expect(mailer.sent).toHaveLength(1);

			expect(await newsletter.confirm(token)).toBe(true);
			expect(await newsletter.confirm(token)).toBe(false);
			expect(mailer.sent).toHaveLength(2);
		});

		it('keeps the confirmation when the welcome mail fails, and logs no address', async () => {
			const log = createFakeLogger();
			const sent = createFakeMailer();
			let failing = false;
			const mailer: Mailer = {
				async send(message) {
					if (failing) throw new Error('Resend send failed with 503');
					return sent.send(message);
				}
			};
			const newsletter = createNewsletterService({
				db: db(),
				mailer,
				log,
				siteUrl: TEST_SITE_URL,
				secret: TEST_AUTH_SECRET,
				now: () => START
			});
			await newsletter.requestSubscription(EMAIL);
			failing = true;

			expect(await newsletter.confirm(tokenFrom(sent.sent[0].text))).toBe(true);

			expect(await rowFor(EMAIL)).toMatchObject({ is_active: true });
			const failure = log.entries.find((entry) => entry.level === 'error');
			expect(failure?.message).toBe('newsletter welcome email failed');
			expect(failure?.fields).toMatchObject({ error: 'Resend send failed with 503' });
			expect(JSON.stringify(log.entries)).not.toContain(EMAIL);
		});
	});

	it('never logs an address across request, confirm and unsubscribe', async () => {
		const { newsletter, mailer, logEntries } = setup();
		await newsletter.requestSubscription(EMAIL);
		await newsletter.confirm(tokenFrom(mailer.sent[0].text));
		await newsletter.unsubscribe(EMAIL, newsletter.unsubscribeToken(EMAIL));

		expect(logEntries.map((entry) => entry.message)).toEqual([
			'newsletter confirmation sent',
			'newsletter subscription confirmed',
			'newsletter unsubscribed'
		]);
		expect(JSON.stringify(logEntries)).not.toContain(EMAIL);
	});

	// Ported from legacy/src/lib/server/newsletter{,.nosecret}.test.ts.
	describe('unsubscribe tokens', () => {
		it('unsubscribeToken returns 64 lowercase hex characters', () => {
			expect(setup().newsletter.unsubscribeToken('a@b.c')).toMatch(HEX_64);
		});

		it('is deterministic (HMAC-SHA256 of the email keyed with the secret)', () => {
			const { newsletter } = setup();
			const first = newsletter.unsubscribeToken('a@b.c');
			expect(newsletter.unsubscribeToken('a@b.c')).toBe(first);
			expect(first).toBe(createHmac('sha256', TEST_AUTH_SECRET).update('a@b.c').digest('hex'));
		});

		it('is case-insensitive in the email', () => {
			const { newsletter } = setup();
			expect(newsletter.unsubscribeToken('A@B.C')).toBe(newsletter.unsubscribeToken('a@b.c'));
		});

		it('verifyUnsubscribeToken round-trips a token minted for the same email', () => {
			const { newsletter } = setup();
			const token = newsletter.unsubscribeToken('a@b.c');
			expect(newsletter.verifyUnsubscribeToken('a@b.c', token)).toBe(true);
		});

		it('fails for a different email', () => {
			const { newsletter } = setup();
			const token = newsletter.unsubscribeToken('a@b.c');
			expect(newsletter.verifyUnsubscribeToken('x@b.c', token)).toBe(false);
		});

		it('fails for a tampered or truncated token', () => {
			const { newsletter } = setup();
			const token = newsletter.unsubscribeToken('a@b.c');
			const flipped = (token[0] === '0' ? '1' : '0') + token.slice(1);
			expect(newsletter.verifyUnsubscribeToken('a@b.c', flipped)).toBe(false);
			expect(newsletter.verifyUnsubscribeToken('a@b.c', token.slice(0, -1))).toBe(false);
			expect(newsletter.verifyUnsubscribeToken('a@b.c', '')).toBe(false);
		});

		it('unsubscribeUrl contains the URL-encoded email and the token', () => {
			const { newsletter } = setup();
			const email = 'first+last@example.com';
			const url = newsletter.unsubscribeUrl(email);
			expect(url).toBe(
				`${TEST_SITE_URL}/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${newsletter.unsubscribeToken(email)}`
			);
		});

		it('refuses to mint a token without a secret', () => {
			const newsletter = createNewsletterService({
				db: db(),
				mailer: createFakeMailer(),
				log: createFakeLogger(),
				siteUrl: TEST_SITE_URL,
				secret: '',
				now: () => START
			});
			expect(() => newsletter.unsubscribeToken('a@b.c')).toThrow(
				'The newsletter unsubscribe secret is not set'
			);
		});
	});

	describe('unsubscribe', () => {
		it('deactivates the address for a valid token and is idempotent', async () => {
			const { newsletter, mailer, advance } = setup();
			await newsletter.requestSubscription(EMAIL);
			await newsletter.confirm(tokenFrom(mailer.sent[0].text));
			advance(5_000);
			const token = newsletter.unsubscribeToken(EMAIL);

			expect(await newsletter.unsubscribe('Reader@Example.com', token)).toBe(true);
			expect(await rowFor(EMAIL)).toMatchObject({
				is_active: false,
				unsubscribed_at: '2026-10-01 09:00:05+00'
			});
			expect(await newsletter.unsubscribe(EMAIL, token)).toBe(true);
			expect(
				await newsletter.unsubscribe(
					'unknown@example.com',
					newsletter.unsubscribeToken('unknown@example.com')
				)
			).toBe(true);
		});

		it('refuses an invalid token and leaves the row active', async () => {
			const { newsletter, mailer } = setup();
			await newsletter.requestSubscription(EMAIL);
			await newsletter.confirm(tokenFrom(mailer.sent[0].text));

			expect(
				await newsletter.unsubscribe(EMAIL, newsletter.unsubscribeToken('other@example.com'))
			).toBe(false);
			expect(await newsletter.unsubscribe(EMAIL, '')).toBe(false);
			expect(await newsletter.unsubscribe('', 'x')).toBe(false);
			expect(await rowFor(EMAIL)).toMatchObject({ is_active: true, unsubscribed_at: null });
		});
	});

	describe('CSV export', () => {
		it('csvCell quotes every value, doubles quotes and neutralises formula prefixes', () => {
			expect(csvCell('plain')).toBe('"plain"');
			expect(csvCell('say "hi"')).toBe('"say ""hi"""');
			expect(csvCell('a,b\nc')).toBe('"a,b\nc"');
			expect(csvCell('=1+1')).toBe(`"'=1+1"`);
			expect(csvCell('+44 20')).toBe(`"'+44 20"`);
			expect(csvCell('-2')).toBe(`"'-2"`);
			expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
			expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
			expect(csvCell('mid=dle')).toBe('"mid=dle"');
			expect(csvCell(null)).toBe('""');
			expect(csvCell(true)).toBe('"true"');
			expect(
				toCsv([
					['a', 1],
					['b', null]
				])
			).toBe('"a","1"\r\n"b",""\r\n');
		});

		it('exports every subscriber with a quoted header, newest first, formulas neutralised', async () => {
			const { newsletter } = setup();
			await db()
				.insert(newsletter_subscribers)
				.values([
					{
						email: 'old@example.com',
						is_active: true,
						confirmed_at: '2026-01-02T00:00:00Z',
						subscribed_at: '2026-01-01T00:00:00Z'
					},
					{
						email: '=cmd|calc@evil.test',
						is_active: false,
						subscribed_at: '2026-02-01T00:00:00Z',
						unsubscribed_at: '2026-03-01T00:00:00Z'
					}
				]);

			const csv = await newsletter.exportCsv();

			expect(csv).toBe(
				[
					'"email","is_active","confirmed_at","subscribed_at","unsubscribed_at"',
					`"'=cmd|calc@evil.test","false","","2026-02-01 00:00:00+00","2026-03-01 00:00:00+00"`,
					'"old@example.com","true","2026-01-02 00:00:00+00","2026-01-01 00:00:00+00",""',
					''
				].join('\r\n')
			);
			expect((await newsletter.list()).map((row) => row.email)).toEqual([
				'=cmd|calc@evil.test',
				'old@example.com'
			]);
		});
	});
});
