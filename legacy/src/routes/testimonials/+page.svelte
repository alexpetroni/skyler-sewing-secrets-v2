<script lang="ts">
	import type { PageData } from './$types';
	import { Avatar } from '$lib/components/ui';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function renderStars(rating: number | null): number[] {
		return Array(rating ?? 5).fill(0);
	}
</script>

<svelte:head>
	<title>Testimonials - Skyler's Sewing Secrets</title>
	<meta name="description" content="Read what students say about Skyler's Sewing Secrets. Real reviews from sewists who have transformed their skills with professional techniques." />
	<meta property="og:title" content="Student Testimonials - Skyler's Sewing Secrets" />
	<meta property="og:description" content="Read what students say about Skyler's Sewing Secrets. Real reviews from sewists who have transformed their skills with professional techniques." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/testimonials" />
</svelte:head>

<PageHeader
	eyebrow="In their words"
	title="What our students say"
	lede="Sewists from around the world who slowed down, learned the finishings, and never sewed the same way again."
/>

<section class="container-default pb-24 sm:pb-32">
	{#if data.testimonials.length > 0}
		<div class="gap-5 md:columns-2 lg:columns-3">
			{#each data.testimonials as testimonial, index}
				<div
					class="mb-5 break-inside-avoid shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-1 hover:shadow-lift"
					use:reveal={{ delay: 50 * (index % 3) }}
				>
					<figure class="core p-7 sm:p-8">
						{#if testimonial.rating}
							<div class="flex gap-1" aria-label="{testimonial.rating} out of 5">
								{#each renderStars(testimonial.rating) as _}
									<svg class="h-3.5 w-3.5 text-gold-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
										<path d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" />
									</svg>
								{/each}
							</div>
						{/if}

						<blockquote class="mt-5 font-serif text-[1.25rem] leading-[1.45] text-charcoal-800">
							“{testimonial.content}”
						</blockquote>

						<figcaption class="mt-7 flex items-center gap-3.5 border-t border-charcoal-900/[0.06] pt-5">
							<Avatar
								src={testimonial.author_avatar_url}
								alt={testimonial.author_name}
								name={testimonial.author_name}
								size="md"
							/>
							<div class="min-w-0">
								<p class="truncate text-[14px] font-semibold text-charcoal-900">{testimonial.author_name}</p>
								{#if testimonial.author_title || testimonial.country}
									<p class="truncate text-[12px] text-charcoal-500">
										{testimonial.author_title}{#if testimonial.author_title && testimonial.country}, {/if}{testimonial.country ?? ''}
									</p>
								{/if}
							</div>
						</figcaption>
					</figure>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-center text-charcoal-500">Testimonials coming soon.</p>
	{/if}

	<div class="mt-20 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-inset ring-charcoal-900/[0.06] sm:px-12 sm:py-16" use:reveal>
		<h2 class="section-title text-balance">Ready to transform your sewing?</h2>
		<p class="section-description mx-auto mt-5 max-w-xl">
			Join the students who have elevated their craft with professional techniques.
		</p>
		<div class="mt-10 flex flex-wrap items-center justify-center gap-4">
			<a href="/checkout" class="btn-primary btn-lg group">
				Enrol now
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
					</svg>
				</span>
			</a>
			<a href="/modules" class="btn-ghost btn-lg group">
				View modules
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
					</svg>
				</span>
			</a>
		</div>
	</div>
</section>
