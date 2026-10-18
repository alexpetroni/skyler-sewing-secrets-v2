<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reveal } from '#lib/actions/reveal.ts';

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
	<div
		class="aurora right-[-8%] -bottom-52 h-[28rem] w-[28rem] bg-sage-200/30"
		aria-hidden="true"
	></div>

	<div
		class="container-default {compact
			? 'pt-16 pb-12 sm:pt-24 sm:pb-16'
			: 'pt-20 pb-16 sm:pt-28 sm:pb-20'}"
	>
		<div class="{align === 'center' ? 'mx-auto text-center' : ''} max-w-3xl">
			{#if eyebrow}
				<span class="eyebrow" use:reveal>{eyebrow}</span>
			{/if}
			<h1 class="page-title text-balance {eyebrow ? 'mt-6' : ''}" use:reveal={{ delay: 60 }}>
				{title}
			</h1>
			{#if lede}
				<p
					class="section-description mt-6 max-w-reading {align === 'center' ? 'mx-auto' : ''}"
					use:reveal={{ delay: 120 }}
				>
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
