<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
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

	const lead = $derived(data.posts[0]);
	const rest = $derived(data.posts.slice(1));
</script>

<svelte:head>
	<title>Blog - Skyler's Sewing Secrets</title>
	<meta name="description" content="Sewing tips, tutorials, and inspiration from Skyler. Learn new techniques and stay updated with the latest in the sewing world." />
	<meta property="og:title" content="Sewing Blog - Skyler's Sewing Secrets" />
	<meta property="og:description" content="Sewing tips, tutorials, and inspiration from Skyler. Learn new techniques and stay updated with the latest in the sewing world." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/blog" />
</svelte:head>

<PageHeader
	eyebrow="The journal"
	title="Notes from the sewing table"
	lede="Tips, tutorials and inspiration to help you on your sewing journey."
/>

<section class="container-default pb-24 sm:pb-32">
	{#if data.posts.length > 0}
		<!-- Lead article gets the full width; the rest sit beneath it. -->
		<a
			href="/blog/{lead.slug}"
			class="group block shell-lg shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-1 hover:shadow-float"
			use:reveal
		>
			<div class="grid overflow-hidden rounded-core-lg bg-white lg:grid-cols-2">
				{#if lead.featured_image_url}
					<div class="overflow-hidden">
						<OptimizedImage
							src={lead.featured_image_url}
							alt={lead.title}
							width={900}
							sizes="(min-width: 1024px) 50vw, 100vw"
							loading="eager"
							class="aspect-[16/10] h-full w-full object-cover transition-transform duration-1000 ease-fluid group-hover:scale-[1.03]"
						/>
					</div>
				{:else}
					<div class="flex aspect-[16/10] items-center justify-center bg-ivory-200">
						<span class="font-serif text-[2rem] italic text-charcoal-300">Skyler's Sewing Secrets</span>
					</div>
				{/if}

				<div class="flex flex-col justify-center p-8 sm:p-11">
					<div class="flex items-center gap-3 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
						Latest
						<span class="h-px w-8 bg-charcoal-900/15"></span>
						<time datetime={lead.published_at || lead.created_at}>
							{formatDate(lead.published_at || lead.created_at)}
						</time>
					</div>
					<h2 class="mt-5 font-serif text-[1.875rem] leading-tight text-charcoal-900 sm:text-[2.25rem]">
						{lead.title}
					</h2>
					{#if lead.excerpt}
						<p class="mt-4 line-clamp-3 max-w-reading text-[16px] leading-relaxed text-charcoal-600">
							{lead.excerpt}
						</p>
					{/if}
					<span class="mt-8 inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-800">
						Read the article
						<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-900/[0.06] transition-transform duration-400 ease-spring group-hover:translate-x-1">
							<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
							</svg>
						</span>
					</span>
				</div>
			</div>
		</a>

		{#if rest.length > 0}
			<div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each rest as post, index}
					<a
						href="/blog/{post.slug}"
						class="group shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-1 hover:shadow-lift"
						use:reveal={{ delay: 50 * (index % 3) }}
					>
						<article class="core flex h-full flex-col overflow-hidden">
							{#if post.featured_image_url}
								<div class="overflow-hidden rounded-t-core">
									<OptimizedImage
										src={post.featured_image_url}
										alt={post.title}
										width={600}
										sizes="(min-width: 1024px) 33vw, 100vw"
										class="aspect-[16/10] w-full object-cover transition-transform duration-1000 ease-fluid group-hover:scale-[1.04]"
									/>
								</div>
							{/if}
							<div class="flex flex-1 flex-col p-7">
								<time datetime={post.published_at || post.created_at} class="text-[11px] uppercase tracking-eyebrow text-charcoal-400">
									{formatDate(post.published_at || post.created_at)}
								</time>
								<h3 class="card-title mt-3">{post.title}</h3>
								{#if post.excerpt}
									<p class="mt-3 line-clamp-3 flex-auto text-[14px] leading-relaxed text-charcoal-600">
										{post.excerpt}
									</p>
								{/if}
							</div>
						</article>
					</a>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="mx-auto max-w-xl shell shadow-ambient" use:reveal>
			<div class="core px-8 py-16 text-center">
				<h2 class="card-title">No posts yet</h2>
				<p class="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-charcoal-600">
					Check back soon for sewing tips, tutorials and inspiration.
				</p>
			</div>
		</div>
	{/if}
</section>
