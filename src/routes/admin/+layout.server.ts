import { requireAdmin, toViewer } from '#lib/server/modules/auth/index.ts';
import type { LayoutServerLoad } from './$types';

// Second layer: the hook already gated /admin, and every admin load and
// action calls `requireAdmin` again itself (actions run before this load).
export const load: LayoutServerLoad = (event) => {
	const { profile } = requireAdmin(event);
	return { viewer: toViewer(profile) };
};
