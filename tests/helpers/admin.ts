import { eq } from 'drizzle-orm';
import { isActionFailure } from '@sveltejs/kit';
import { schema } from '../../src/lib/server/db/index.ts';
import type { Services } from '../../src/lib/server/runtime/container.ts';
import { FIXTURE_PASSWORD } from './fixtures.ts';
import { memberEvent, outcome } from './member.ts';

export interface FormState {
	valid: boolean;
	message?: string;
	errors: Record<string, string[] | undefined> & { _errors?: string[] };
}

/**
 * An active admin account with two-factor authentication flagged on, as the
 * hook and `setAdmin` require. Route tests start past the actual TOTP setup
 * (tests/routes/admin-security.test.ts covers it).
 */
export async function createAdmin(
	services: Services,
	email = 'owner@example.com'
): Promise<string> {
	const id = await services.users.createCredentialUser({ email, password: FIXTURE_PASSWORD });
	await services.db
		.update(schema.profiles)
		.set({ is_admin: true })
		.where(eq(schema.profiles.id, id));
	await markTwoFactorEnabled(services, id);
	return id;
}

/** Sets `users.twoFactorEnabled` without a secret: enough for the gates that read the flag. */
export async function markTwoFactorEnabled(services: Services, userId: string): Promise<void> {
	await services.db
		.update(schema.users)
		.set({ twoFactorEnabled: true })
		.where(eq(schema.users.id, userId));
}

/** The status and superforms state of a `fail()` an action returned. */
export function failed(result: unknown): { status: number; form: FormState } {
	if (!isActionFailure(result))
		throw new Error(`expected a failure, got ${JSON.stringify(result)}`);
	return { status: result.status, form: (result.data as unknown as { form: FormState }).form };
}

/**
 * Runs a form action as `userId` (null = anonymous) with the given fields;
 * resolves to its result or `redirect …` / `error …` (see `outcome`).
 */
export async function submitAction<E>(
	services: Services,
	userId: string | null,
	action: (event: E) => unknown,
	{
		url,
		params = {},
		fields = {}
	}: { url: string; params?: Record<string, string>; fields?: Record<string, string> }
) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	const event = await memberEvent(services, userId, { method: 'POST', url, body, params });
	return outcome(() => action(event as unknown as E));
}

/** Runs a page load as `userId`. */
export async function runLoad<E>(
	services: Services,
	userId: string | null,
	load: (event: E) => unknown,
	{ url, params = {} }: { url: string; params?: Record<string, string> }
) {
	const event = await memberEvent(services, userId, { url, params });
	return outcome(() => load(event as unknown as E));
}

/** Audit actions recorded for one entity, oldest first. */
export async function auditActions(services: Services, entityId: string): Promise<string[]> {
	const rows = await services.db
		.select({ action: schema.audit_log.action })
		.from(schema.audit_log)
		.where(eq(schema.audit_log.entity_id, entityId))
		.orderBy(schema.audit_log.created_at);
	return rows.map((row) => row.action);
}
