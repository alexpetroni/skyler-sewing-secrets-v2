<script lang="ts">
	import type { Testimonial } from '$lib/types';
	import { Avatar } from '$lib/components/ui';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		testimonials: Testimonial[];
	}

	let { testimonials }: Props = $props();

	function starCount(rating: number | null): number[] {
		return Array(rating ?? 5).fill(0);
	}
</script>

<section class="section relative isolate overflow-hidden">
	<div class="aurora right-[-8%] top-16 h-[28rem] w-[28rem] bg-sage-200/35" aria-hidden="true"></div>

	<div class="container-default">
		<div class="max-w-2xl" use:reveal>
			<span class="eyebrow">In their words</span>
			<h2 class="section-title mt-6 text-balance">I have worked with amazing people</h2>
			<p class="section-description mt-5">
				Students who slowed down, learned the finishings, and never sewed the same way again.
			</p>
		</div>

		{#if testimonials.length > 0}
			<!-- Columns rather than a grid: quotes of different lengths sit naturally. -->
			<div class="mt-16 gap-5 sm:mt-20 md:columns-2 lg:columns-3">
				{#each testimonials as testimonial, index}
					<div
						class="mb-5 break-inside-avoid shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-1 hover:shadow-lift"
						use:reveal={{ delay: 60 * (index % 3) }}
					>
						<figure class="core p-7 sm:p-8">
							{#if testimonial.rating}
								<div class="flex gap-1" aria-label="{testimonial.rating} out of 5">
									{#each starCount(testimonial.rating) as _}
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
									<p class="truncate text-[14px] font-semibold text-charcoal-900">
										{testimonial.author_name}
									</p>
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

			<div class="mt-12 flex justify-center" use:reveal>
				<a href="/testimonials" class="btn-ghost group">
					Read every review
					<span class="btn-orb" aria-hidden="true">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
						</svg>
					</span>
				</a>
			</div>
		{:else}
			<p class="mt-16 text-center text-charcoal-500">Testimonials coming soon.</p>
		{/if}
	</div>
</section>
