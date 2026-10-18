import { message } from 'sveltekit-superforms/server';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import {
	twoFactorCodeSchema,
	twoFactorDisableSchema,
	twoFactorPasswordSchema
} from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	enable: adminForm(twoFactorPasswordSchema, { id: 'enable' }),
	verify: adminForm(twoFactorCodeSchema, { id: 'verify' }),
	disable: adminForm(twoFactorDisableSchema, { id: 'disable' })
};

/**
 * The one admin page reachable without two-factor authentication: the hook
 * sends every other /admin request here until `users.twoFactorEnabled` is on.
 */
export const load: PageServerLoad = async (event) => {
	const { user } = requireAdmin(event);
	const [enable, verify, disable] = await Promise.all([
		forms.enable.empty(),
		forms.verify.empty(),
		forms.disable.empty()
	]);
	return {
		enabled: user.twoFactorEnabled === true,
		required: event.url.searchParams.has('required'),
		forms: { enable, verify, disable }
	};
};

export const actions: Actions = {
	enable: async (event) => {
		requireAdmin(event);
		const parsed = await forms.enable.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			const setup = await event.locals.services.twoFactor.begin({
				password: parsed.data.password,
				headers: event.request.headers
			});
			return { form: parsed.form, setup };
		} catch (err) {
			return mapDomainError(parsed.form, err, { INVALID_PASSWORD: 'password' });
		}
	},

	verify: async (event) => {
		requireAdmin(event);
		const parsed = await forms.verify.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.twoFactor.confirm({
				code: parsed.data.code,
				headers: event.request.headers
			});
		} catch (err) {
			return mapDomainError(parsed.form, err, { INVALID_CODE: 'code' });
		}
		return message(parsed.form, 'Two-factor authentication is on.');
	},

	disable: async (event) => {
		requireAdmin(event);
		const parsed = await forms.disable.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.twoFactor.disable({
				password: parsed.data.password,
				code: parsed.data.code,
				headers: event.request.headers
			});
		} catch (err) {
			return mapDomainError(parsed.form, err, {
				INVALID_PASSWORD: 'password',
				INVALID_CODE: 'code'
			});
		}
		return message(parsed.form, 'Two-factor authentication is off.');
	}
};
