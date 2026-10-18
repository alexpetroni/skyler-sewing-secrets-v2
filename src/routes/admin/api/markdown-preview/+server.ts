import { readJson } from '#lib/server/http/api.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { renderMarkdown } from '#lib/server/modules/content/index.ts';
import { markdownPreviewSchema } from '#lib/shared/schemas/admin.ts';
import type { RequestHandler } from './$types';

/** The editor's preview: the same marked + sanitize-html pass that runs on save. */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = await readJson(event.request, markdownPreviewSchema);
	if (!body.ok) return body.response;
	return Response.json({ html: renderMarkdown(body.data.markdown) });
};
