<script lang="ts">
	import { asset } from '$app/paths';
	import { PUBLIC_BUNNY_CDN_URL } from '$app/env/public';
	import type { AssetPath } from '$app/types';

	interface Props {
		src: string;
		alt: string;
		width?: number;
		height?: number;
		quality?: number;
		sizes?: string;
		loading?: 'lazy' | 'eager';
		class?: string;
	}

	let {
		src,
		alt,
		width = 800,
		height,
		quality = 80,
		sizes,
		loading = 'lazy',
		class: className = ''
	}: Props = $props();

	// Default sizes based on width prop if not specified
	const defaultSizes = $derived(sizes ?? `(max-width: ${width}px) 100vw, ${width}px`);

	const BUNNY_CDN_URL = PUBLIC_BUNNY_CDN_URL;

	// Only files from `static/` go through the pull zone; absolute URLs are already hosted.
	const isStaticPath = $derived(!/^[a-z][a-z0-9+.-]*:/i.test(src));

	function getOptimizedSrc(originalSrc: string, w: number, q: number): string {
		const basePath = originalSrc.replace(/^\/static\//, '').replace(/^\//, '');
		const queryParams = new URLSearchParams({
			width: w.toString(),
			quality: q.toString(),
			...(height ? { height: height.toString() } : {})
		});

		return `${BUNNY_CDN_URL}/${basePath}?${queryParams.toString()}`;
	}

	const srcSet = $derived(
		[
			`${getOptimizedSrc(src, 400, quality)} 400w`,
			`${getOptimizedSrc(src, 800, quality)} 800w`,
			`${getOptimizedSrc(src, 1200, quality)} 1200w`,
			`${getOptimizedSrc(src, 1600, quality)} 1600w`
		].join(', ')
	);

	const optimizedSrc = $derived(getOptimizedSrc(src, width, quality));

	// Static paths also arrive from the database (thumbnails), so they cannot be checked statically.
	const plainSrc = $derived(isStaticPath ? asset(src.replace(/^\//, '') as AssetPath) : src);
</script>

{#if BUNNY_CDN_URL && isStaticPath}
	<img src={optimizedSrc} srcset={srcSet} sizes={defaultSizes} {alt} class={className} {loading} />
{:else}
	<img src={plainSrc} {alt} class={className} {loading} />
{/if}
