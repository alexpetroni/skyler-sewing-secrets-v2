<script lang="ts">
	import type { Snippet } from 'svelte';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

	interface Props {
		title: string;
		lede?: string;
		showLogo?: boolean;
		children: Snippet;
		footer?: Snippet;
	}

	let { title, lede, showLogo = false, children, footer }: Props = $props();
</script>

<section class="relative isolate flex min-h-[100dvh] flex-col justify-center overflow-hidden py-16 sm:py-24">
	<div class="aurora -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 bg-brand-200/30 animate-breathe" aria-hidden="true"></div>
	<div class="aurora -bottom-40 right-[-10%] h-[28rem] w-[28rem] bg-sage-200/30" aria-hidden="true"></div>

	<div class="mx-auto w-full max-w-md px-5 sm:px-0">
		<div class="text-center">
			{#if showLogo}
				<OptimizedImage
					class="mx-auto h-14 w-auto"
					src="/logo/logo.png"
					alt="Skyler's Sewing Secrets"
					width={220}
				/>
			{/if}
			<h1 class="font-serif text-[2rem] leading-tight text-charcoal-900 {showLogo ? 'mt-7' : ''} sm:text-[2.25rem]">
				{title}
			</h1>
			{#if lede}
				<p class="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-charcoal-500">{lede}</p>
			{/if}
		</div>

		<div class="mt-10 shell-lg shadow-float">
			<div class="core-lg px-7 py-9 sm:px-9 sm:py-10">
				{@render children()}
			</div>
		</div>

		{#if footer}
			<p class="mt-8 text-center text-[14px] text-charcoal-500">
				{@render footer()}
			</p>
		{/if}
	</div>
</section>
