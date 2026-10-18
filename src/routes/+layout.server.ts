import type { Viewer } from '#lib/shared/viewer.ts';
import type { LayoutServerLoad } from './$types';

// PHASE-05 resolves the viewer from the session and maintenance from settings.
export const load: LayoutServerLoad = () => {
	return {
		viewer: null as Viewer | null,
		maintenance: false
	};
};
