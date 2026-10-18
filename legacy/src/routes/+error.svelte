<script lang="ts">
	import { page } from '$app/state';

	const isNotFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{isNotFound ? 'Page not found' : 'Something went wrong'} - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="relative isolate flex min-h-[70dvh] items-center justify-center overflow-hidden px-5 py-24">
	<div class="aurora -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 bg-ivory-300/60" aria-hidden="true"></div>

	<div class="w-full max-w-lg text-center">
		<p class="font-serif text-[5rem] leading-none text-charcoal-200">{page.status}</p>

		<h1 class="page-title mt-4 text-balance">
			{isNotFound ? 'This page slipped a stitch' : 'Something went wrong'}
		</h1>

		<p class="section-description mx-auto mt-6 max-w-md">
			{#if isNotFound}
				The page you're after doesn't exist, or has moved. The course itself is right where you left
				it.
			{:else}
				{page.error?.message || 'An unexpected error occurred. Please try again in a moment.'}
			{/if}
		</p>

		<div class="mt-10 flex flex-wrap justify-center gap-4">
			<a href="/" class="btn-primary group">
				Back to home
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
					</svg>
				</span>
			</a>
			<a href="/modules" class="btn-secondary">Browse modules</a>
		</div>
	</div>
</section>
