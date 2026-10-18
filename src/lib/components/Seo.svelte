<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_SITE_URL } from '$app/env/public';

	/** The share image legacy pages used when they had none of their own. */
	const DEFAULT_OG_IMAGE = 'https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg';

	interface Props {
		/** The full document title, e.g. "About Course - Skyler's Sewing Secrets". */
		title: string;
		description: string;
		/** Canonical path; defaults to the current pathname. */
		path?: string;
		image?: string | null;
		type?: 'website' | 'article';
		noindex?: boolean;
	}

	let {
		title,
		description,
		path,
		image = null,
		type = 'website',
		noindex = false
	}: Props = $props();

	// The configured origin, not the request's, so previews still point at the live site.
	const origin = $derived((PUBLIC_SITE_URL ?? page.url.origin).replace(/\/$/, ''));
	const canonical = $derived(`${origin}${path ?? page.url.pathname}`);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if noindex}
		<meta name="robots" content="noindex" />
	{:else}
		<link rel="canonical" href={canonical} />
	{/if}
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image || DEFAULT_OG_IMAGE} />
	<meta property="og:type" content={type} />
	<meta property="og:url" content={canonical} />
</svelte:head>
