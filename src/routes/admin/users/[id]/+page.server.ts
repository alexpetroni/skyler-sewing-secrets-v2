import { error, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import {
	emptyActionSchema,
	grantProductSchema,
	revokeProductSchema,
	setAdminSchema,
	suspendSchema
} from '#lib/shared/schemas/admin.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	suspend: adminForm(suspendSchema, { id: 'suspend' }),
	unsuspend: adminForm(emptyActionSchema, { id: 'unsuspend' }),
	grant: adminForm(grantProductSchema, { id: 'grant' }),
	revoke: adminForm(revokeProductSchema, { id: 'revoke' }),
	sendReset: adminForm(emptyActionSchema, { id: 'sendReset' }),
	setAdmin: adminForm(setAdminSchema, { id: 'setAdmin' }),
	revokeSessions: adminForm(emptyActionSchema, { id: 'revokeSessions' })
};

/** The user the page is about; anything but a uuid is a 404. */
function targetId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'User not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const detail = await event.locals.services.admin.users.detail(targetId(event));
	if (!detail) error(404, 'User not found');
	const [suspend, unsuspend, grant, revoke, sendReset, setAdmin, revokeSessions] =
		await Promise.all([
			forms.suspend.empty(),
			forms.unsuspend.empty(),
			forms.grant.empty(),
			forms.revoke.empty(),
			forms.sendReset.empty(),
			forms.setAdmin.empty(),
			forms.revokeSessions.empty()
		]);
	return {
		detail,
		forms: { suspend, unsuspend, grant, revoke, sendReset, setAdmin, revokeSessions }
	};
};

export const actions: Actions = {
	suspend: async (event) => {
		const { user } = requireAdmin(event);
		const userId = targetId(event);
		const parsed = await forms.suspend.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.admin.users.suspend({
				userId,
				reason: parsed.data.reason,
				actorId: user.id
			});
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Account suspended; every session was signed out.');
	},

	unsuspend: async (event) => {
		const { user } = requireAdmin(event);
		const userId = targetId(event);
		const parsed = await forms.unsuspend.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.admin.users.unsuspend({ userId, actorId: user.id });
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Account restored.');
	},

	grant: async (event) => {
		const { user } = requireAdmin(event);
		const userId = targetId(event);
		const parsed = await forms.grant.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.admin.users.grantProduct({
				userId,
				productId: parsed.data.productId,
				reason: parsed.data.reason,
				actorId: user.id
			});
		} catch (err) {
			return mapDomainError(parsed.form, err, {
				ALREADY_OWNED: 'productId',
				PRODUCT_NOT_FOUND: 'productId'
			});
		}
		return message(parsed.form, 'Product granted.');
	},

	revoke: async (event) => {
		const { user } = requireAdmin(event);
		const userId = targetId(event);
		const parsed = await forms.revoke.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.admin.users.revokeProduct({
				userId,
				productId: parsed.data.productId,
				reason: parsed.data.reason,
				actorId: user.id
			});
		} catch (err) {
			return mapDomainError(parsed.form, err, { NOT_OWNED: 'productId' });
		}
		return message(parsed.form, 'Access revoked.');
	},

	sendReset: async (event) => {
		const { user } = requireAdmin(event);
		const userId = targetId(event);
		const parsed = await forms.sendReset.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.admin.users.sendReset({ userId, actorId: user.id });
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Password reset email sent.');
	},

	setAdmin: async (event) => {
		const { user } = requireAdmin(event);
		const userId = targetId(event);
		const parsed = await forms.setAdmin.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.admin.users.setAdmin({
				userId,
				isAdmin: parsed.data.isAdmin,
				actorId: user.id
			});
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(
			parsed.form,
			parsed.data.isAdmin ? 'Admin access given.' : 'Admin access removed.'
		);
	},

	revokeSessions: async (event) => {
		const { user } = requireAdmin(event);
		const userId = targetId(event);
		const parsed = await forms.revokeSessions.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let count: number;
		try {
			count = await event.locals.services.admin.users.revokeSessions({ userId, actorId: user.id });
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, `${count} ${count === 1 ? 'session' : 'sessions'} signed out.`);
	}
};
