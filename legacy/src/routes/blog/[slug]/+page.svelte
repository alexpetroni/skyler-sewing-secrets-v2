<script lang="ts">
	import type { PageData } from './$types';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '';
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{data.post.title} - Skyler's Sewing Secrets Blog</title>
	<meta name="description" content={data.post.excerpt || `Read ${data.post.title} on Skyler's Sewing Secrets blog.`} />
	<meta property="og:title" content={data.post.title} />
	<meta property="og:description" content={data.post.excerpt || `Read ${data.post.title} on Skyler's Sewing Secrets blog.`} />
	<meta property="og:image" content={data.post.featured_image_url || 'https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg'} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content={`https://skylersewingsecrets.com/blog/${data.post.slug}`} />
</svelte:head>

<article>
	<header class="relative isolate overflow-hidden">
		<div class="aurora -top-24 left-[-8%] h-[26rem] w-[26rem] bg-brand-200/30" aria-hidden="true"></div>

		<div class="container-narrow pb-12 pt-16 sm:pt-24">
			<a
				href="/blog"
				class="group inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-500 transition-colors duration-400 ease-fluid hover:text-charcoal-900"
			>
				<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-900/[0.05] transition-transform duration-400 ease-spring group-hover:-translate-x-1">
					<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
					</svg>
				</span>
				Back to the journal
			</a>

			<time
				datetime={data.post.published_at || data.post.created_at}
				class="mt-12 block text-[11px] uppercase tracking-eyebrow text-charcoal-400"
			>
				{formatDate(data.post.published_at || data.post.created_at)}
			</time>

			<h1 class="page-title mt-5 text-balance">{data.post.title}</h1>

			{#if data.post.excerpt}
				<p class="mt-7 max-w-reading font-serif text-[1.375rem] italic leading-snug text-charcoal-500">
					{data.post.excerpt}
				</p>
			{/if}
		</div>
	</header>

	{#if data.post.featured_image_url}
		<div class="container-default" use:reveal>
			<div class="shell-lg shadow-float">
				<div class="core-lg overflow-hidden">
					<OptimizedImage
						src={data.post.featured_image_url}
						alt={data.post.title}
						width={1400}
						sizes="(min-width: 1280px) 1200px, 100vw"
						loading="eager"
						class="aspect-[16/9] w-full object-cover"
					/>
				</div>
			</div>
		</div>
	{/if}

	<div class="container-narrow py-16 sm:py-20">
		<div class="prose-editorial">
			{@html data.post.content}
		</div>

		<div class="mt-16 flex items-center gap-4 border-t border-charcoal-900/[0.07] pt-8">
			<span class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 font-serif text-lg text-sage-700 ring-1 ring-inset ring-sage-700/10">
				S
			</span>
			<div>
				<p class="text-[15px] font-semibold text-charcoal-900">Skyler</p>
				<p class="text-[13px] text-charcoal-500">Professional dressmaker & educator</p>
			</div>
		</div>

		<div class="mt-14 rounded-shell bg-ivory-100 px-8 py-12 text-center ring-1 ring-inset ring-charcoal-900/[0.06] sm:px-10" use:reveal>
			<h2 class="subsection-heading">Want to learn more?</h2>
			<p class="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-charcoal-600">
				Get every professional sewing tutorial, with lifetime access.
			</p>
			<a href="/checkout" class="btn-primary group mt-8">
				Enrol in the course
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
					</svg>
				</span>
			</a>
		</div>
	</div>
</article>
