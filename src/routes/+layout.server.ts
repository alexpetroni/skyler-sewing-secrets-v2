import { toViewer } from '#lib/server/modules/auth/index.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		viewer: toViewer(locals.profile),
		maintenance: locals.maintenanceMode
	};
};
