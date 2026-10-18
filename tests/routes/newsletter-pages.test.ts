import { eq } from 'drizzle-orm';
import { isActionFailure, isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { load as confirmLoad } from '../../src/routes/(marketing)/newsletter/confirm/+page.server.ts';
import {
	actions as unsubscribeActions,
	load as unsubscribeLoad
} from '../../src/routes/(marketing)/newsletter/unsubscribe/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { newsletter_subscribers } = schema;

type ConfirmEvent = Parameters<typeof confirmLoad>[0];
type UnsubscribeLoadEvent = Parameters<typeof unsubscribeLoad>[0];
type UnsubscribeActionEvent = Parameters<typeof unsubscribeActions.default>[0];

const EMAIL = 'reader@example.com';

describe('newsletter pages', () => {
	const { db } = useTestDb();
	let services: TestServices;

	beforeEach(() => {
		services = createTestServices(db());
	});

	const rowFor = async () =>
		(
			await db()
				.select()
				.from(newsletter_subscribers)
				.where(eq(newsletter_subscribers.email, EMAIL))
		)[0];

	async function confirmToken(): Promise<string> {
		await services.marketing.newsletter.requestSubscription(EMAIL);
		const token = /confirm\?token=([A-Za-z0-9_-]+)/.exec(services.mailer.sent[0].text)?.[1];
		if (!token) throw new Error('no confirm link');
		return token;
	}

	function confirm(token: string | null) {
		const event = fakeEvent({
			url: token === null ? '/newsletter/confirm' : `/newsletter/confirm?token=${token}`,
			locals: { services }
		});
		return confirmLoad(event as unknown as ConfirmEvent);
	}

	describe('/newsletter/confirm', () => {
		it('confirms with a valid token and sends the welcome mail', async () => {
			const token = await confirmToken();

			expect(await confirm(token)).toEqual({ confirmed: true });
			expect(await rowFor()).toMatchObject({ is_active: true });
			expect(services.mailer.sent).toHaveLength(2);
		});

		it('shows the invalid-link state for a missing, unknown or reused token', async () => {
			const token = await confirmToken();
			expect(await confirm(null)).toEqual({ confirmed: false });
			expect(await confirm('x'.repeat(43))).toEqual({ confirmed: false });
			expect(await rowFor()).toMatchObject({ is_active: false });

			await confirm(token);
			expect(await confirm(token)).toEqual({ confirmed: false });
			expect(services.mailer.sent).toHaveLength(2);
		});
	});

	describe('/newsletter/unsubscribe', () => {
		beforeEach(async () => {
			await db().insert(newsletter_subscribers).values({
				email: EMAIL,
				is_active: true,
				confirmed_at: '2026-09-01T00:00:00Z'
			});
		});

		async function loadWith(query: string) {
			const event = fakeEvent({ url: `/newsletter/unsubscribe${query}`, locals: { services } });
			try {
				return await unsubscribeLoad(event as unknown as UnsubscribeLoadEvent);
			} catch (e) {
				if (isHttpError(e)) return `error ${e.status}`;
				throw e;
			}
		}

		function post(fields: Record<string, string>) {
			const body = new FormData();
			for (const [name, value] of Object.entries(fields)) body.set(name, value);
			const event = fakeEvent({
				method: 'POST',
				url: '/newsletter/unsubscribe',
				body,
				locals: { services }
			});
			return unsubscribeActions.default(event as unknown as UnsubscribeActionEvent);
		}

		it('GET verifies the signed link without touching the row', async () => {
			const token = services.marketing.newsletter.unsubscribeToken(EMAIL);

			expect(
				await loadWith(`?email=${encodeURIComponent('Reader@Example.com')}&token=${token}`)
			).toEqual({
				email: EMAIL,
				token
			});
			expect(await rowFor()).toMatchObject({ is_active: true });
			expect(await loadWith(`?email=${EMAIL}&token=${'0'.repeat(64)}`)).toBe('error 400');
			expect(await loadWith(`?email=${EMAIL}`)).toBe('error 400');
		});

		it('POST unsubscribes with a valid token and refuses a forged one', async () => {
			const forged = await post({
				email: EMAIL,
				token: services.marketing.newsletter.unsubscribeToken('x@y.z')
			});
			if (!isActionFailure(forged)) throw new Error('expected a failure');
			expect(forged.status).toBe(400);
			expect(await rowFor()).toMatchObject({ is_active: true });

			expect(
				await post({ email: EMAIL, token: services.marketing.newsletter.unsubscribeToken(EMAIL) })
			).toEqual({
				success: true
			});
			expect(await rowFor()).toMatchObject({ is_active: false });
		});
	});
});
