import { courseOutlinePage } from '#lib/server/http/member-area.ts';
import type { PageServerLoad } from './$types';

// Public: anonymous visitors see the outline with lock states, owners their progress.
export const load: PageServerLoad = async ({ locals }) => courseOutlinePage(locals);
