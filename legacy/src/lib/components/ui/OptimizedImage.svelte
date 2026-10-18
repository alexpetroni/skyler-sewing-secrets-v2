<script lang="ts">
	import { env } from '$env/dynamic/public';

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

	let { src, alt, width = 800, height, quality = 80, sizes, loading = 'lazy', class: className = '' }: Props = $props();

	// Default sizes based on width prop if not specified
	const defaultSizes = $derived(sizes ?? `(max-width: ${width}px) 100vw, ${width}px`);

	const BUNNY_CDN_URL = env.PUBLIC_BUNNY_CDN_URL;

	function getOptimizedSrc(originalSrc: string, w: number, q: number): string {
		if (!BUNNY_CDN_URL) {
			return originalSrc;
		}

		const basePath = originalSrc.replace(/^\/static\//, '').replace(/^\//, '');
		const queryParams = new URLSearchParams({
			width: w.toString(),
			quality: q.toString(),
		});

		if (height) {
			queryParams.set('height', height.toString());
		}

		return `${BUNNY_CDN_URL}/${basePath}?${queryParams.toString()}`;
	}

	const srcSet = $derived([
		`${getOptimizedSrc(src, 400, quality)} 400w`,
		`${getOptimizedSrc(src, 800, quality)} 800w`,
		`${getOptimizedSrc(src, 1200, quality)} 1200w`,
		`${getOptimizedSrc(src, 1600, quality)} 1600w`,
	].join(', '));

	const optimizedSrc = $derived(getOptimizedSrc(src, width, quality));
</script>

{#if BUNNY_CDN_URL}
	<img
		src={optimizedSrc}
		srcset={srcSet}
		sizes={defaultSizes}
		{alt}
		class={className}
		{loading}
	/>
{:else}
	<img
		src={src}
		{alt}
		class={className}
		{loading}
	/>
{/if}

