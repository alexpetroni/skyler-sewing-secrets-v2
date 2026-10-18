import * as v from 'valibot';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { renderMarkdown } from '#lib/server/modules/content/index.ts';
import { markdownPreviewSchema } from '#lib/shared/schemas/admin.ts';
import type { RequestHandler } from './$types';

/** The editor's preview: the same marked + sanitize-html pass that runs on save. */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return Response.json({ error: 'Invalid request' }, { status: 400 });
	}
	const parsed = v.safeParse(markdownPreviewSchema, body);
	if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
	return Response.json({ html: renderMarkdown(parsed.output.markdown) });
};
