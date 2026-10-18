import { toViewer } from '#lib/server/modules/auth/index.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, cookies }) => {
	return {
		viewer: toViewer(locals.profile),
		maintenance: locals.maintenanceMode,
		// The signed cookie alone: no database query on every page.
		cartCount: locals.services.commerce.cartCookie.read(cookies).items.length
	};
};
