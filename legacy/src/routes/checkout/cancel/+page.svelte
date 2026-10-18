<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
</script>

<svelte:head>
	<title>Checkout Cancelled - Skyler's Sewing Secrets</title>
	<meta name="description" content="Your checkout was cancelled. Return to continue your enrollment in Skyler's Sewing Secrets." />
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="relative isolate overflow-hidden">
	<div class="aurora -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 bg-ivory-300/50" aria-hidden="true"></div>

	<div class="mx-auto max-w-xl px-5 py-24 text-center sm:py-32">
		<span class="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-white text-charcoal-400 shadow-ambient ring-1 ring-inset ring-charcoal-900/[0.06]" use:reveal>
			<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
				<path d="m6 6 12 12M18 6 6 18" />
			</svg>
		</span>

		<h1 class="page-title mt-9 text-balance" use:reveal={{ delay: 60 }}>Checkout cancelled</h1>

		<p class="section-description mt-6" use:reveal={{ delay: 120 }}>
			You have not been charged. Nothing is lost — pick it back up whenever you're ready.
		</p>

		<div class="mt-10 flex flex-col justify-center gap-4 sm:flex-row" use:reveal={{ delay: 180 }}>
			<a href="/checkout" class="btn-primary btn-lg group">
				Try again
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
					</svg>
				</span>
			</a>
			<a href="/" class="btn-secondary btn-lg">Return home</a>
		</div>

		<p class="mt-9 text-[13px] text-charcoal-500">
			Having trouble? <a href="/contact" class="link">Contact us</a> and we'll help you out.
		</p>
	</div>
</section>
