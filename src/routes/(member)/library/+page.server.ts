import { requireActiveMember } from '#lib/server/modules/auth/index.ts';
import { libraryPage } from '#lib/server/http/member-area.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// Sign-in redirect, 403 for suspended accounts, catalogue for owners of nothing.
	const { user, profile } = await requireActiveMember(event, '/library');
	return { name: profile.full_name, ...(await libraryPage(event.locals, user.id)) };
};
