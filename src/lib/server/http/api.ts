import * as v from 'valibot';
import { DomainError } from '#lib/server/modules/errors.ts';

/** A JSON body checked against `schema`, or the 400 response to send instead. */
export async function readJson<S extends v.GenericSchema>(
	request: Request,
	schema: S
): Promise<{ ok: true; data: v.InferOutput<S> } | { ok: false; response: Response }> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return { ok: false, response: Response.json({ error: 'Invalid request' }, { status: 400 }) };
	}
	const parsed = v.safeParse(schema, body);
	if (!parsed.success) {
		return {
			ok: false,
			response: Response.json({ error: parsed.issues[0].message }, { status: 400 })
		};
	}
	return { ok: true, data: parsed.output };
}

/** Whether a thrown value is a service's expected refusal rather than a bug. */
export function isDomainError(err: unknown): err is DomainError {
	return err instanceof DomainError;
}

/**
 * A service's `DomainError` as a JSON response: `*_NOT_FOUND` is a 404, every
 * other refusal a 400. Anything else is a bug and is rethrown (a 500).
 */
export function domainErrorResponse(err: unknown): Response {
	if (!isDomainError(err)) throw err;
	const status = err.code.endsWith('_NOT_FOUND') ? 404 : 400;
	return Response.json({ error: err.message, code: err.code }, { status });
}
