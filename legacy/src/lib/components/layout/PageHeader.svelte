<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		eyebrow?: string;
		title: string;
		lede?: string;
		align?: 'left' | 'center';
		/** Tightens the vertical rhythm for utility pages (auth, legal). */
		compact?: boolean;
		children?: Snippet;
	}

	let { eyebrow, title, lede, align = 'left', compact = false, children }: Props = $props();
</script>

<section class="relative isolate overflow-hidden">
	<div
		class="aurora {align === 'center'
			? 'left-1/2 -translate-x-1/2'
			: 'left-[-8%]'} -top-24 h-[26rem] w-[26rem] bg-brand-200/30"
		aria-hidden="true"
	></div>
	<div class="aurora -bottom-52 right-[-8%] h-[28rem] w-[28rem] bg-sage-200/30" aria-hidden="true"></div>

	<div class="container-default {compact ? 'pb-12 pt-16 sm:pb-16 sm:pt-24' : 'pb-16 pt-20 sm:pb-20 sm:pt-28'}">
		<div class="{align === 'center' ? 'mx-auto text-center' : ''} max-w-3xl">
			{#if eyebrow}
				<span class="eyebrow" use:reveal>{eyebrow}</span>
			{/if}
			<h1 class="page-title text-balance {eyebrow ? 'mt-6' : ''}" use:reveal={{ delay: 60 }}>
				{title}
			</h1>
			{#if lede}
				<p class="section-description mt-6 max-w-reading {align === 'center' ? 'mx-auto' : ''}" use:reveal={{ delay: 120 }}>
					{lede}
				</p>
			{/if}
			{#if children}
				<div class="mt-9" use:reveal={{ delay: 180 }}>
					{@render children()}
				</div>
			{/if}
		</div>
	</div>
</section>
