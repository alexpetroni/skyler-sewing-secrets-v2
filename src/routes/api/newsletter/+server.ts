import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { screenInput } from '#lib/server/http/submissions.ts';
import { newsletterSchema } from '#lib/shared/schemas/marketing.ts';
import type { RequestHandler } from './$types';

// The same answer whether the address is new, pending or already confirmed,
// so the endpoint does not reveal who is subscribed.
const ACCEPTED = 'Please check your inbox to confirm your subscription.';

export const POST: RequestHandler = async (event) => {
	const { marketing } = event.locals.services;

	let form: Record<string, string>;
	try {
		form = await readForm(event.request);
	} catch {
		return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 });
	}

	const screened = await marketing.screen(screenInput(event, 'newsletter', form));
	switch (screened.outcome) {
		case 'rate_limited':
			return Response.json(
				{ ok: false, error: 'Too many requests. Please try again later.' },
				{ status: 429, headers: { 'Retry-After': String(screened.retryAfterSeconds) } }
			);
		case 'honeypot':
			return Response.json({ ok: true, message: ACCEPTED });
		case 'challenge_failed':
			return Response.json(
				{ ok: false, error: 'Please complete the verification and try again.' },
				{ status: 400 }
			);
	}

	const parsed = v.safeParse(newsletterSchema, form);
	if (!parsed.success) {
		return Response.json({ ok: false, error: parsed.issues[0].message }, { status: 400 });
	}

	await marketing.newsletter.requestSubscription(parsed.output.email);
	return Response.json({ ok: true, message: ACCEPTED });
};
