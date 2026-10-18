import { PUBLIC_SITE_URL } from '$app/env/public';
import { escapeHtml } from '#lib/shared/html.ts';
import type { RequestHandler } from './$types';

/** Public pages that exist independently of the database. */
const STATIC_PATHS = [
	'/',
	'/about',
	'/fabric-library',
	'/faq',
	'/blog',
	'/testimonials',
	'/contact',
	'/legal/terms-and-conditions',
	'/legal/privacy',
	'/legal/claims'
] as const;

export const GET: RequestHandler = async ({ locals, url }) => {
	const { marketing, catalog } = locals.services;
	const [posts, products] = await Promise.all([
		marketing.blog.listPublished(),
		catalog.listPublished()
	]);

	const origin = (PUBLIC_SITE_URL ?? url.origin).replace(/\/$/, '');
	const paths = [
		...STATIC_PATHS,
		...posts.map((post) => `/blog/${post.slug}`),
		...products.map((product) => `/products/${product.slug}`)
	];
	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...paths.map((path) => `\t<url><loc>${escapeHtml(origin + path)}</loc></url>`),
		'</urlset>',
		''
	].join('\n');

	return new Response(body, {
		headers: { 'content-type': 'application/xml; charset=utf-8' }
	});
};
