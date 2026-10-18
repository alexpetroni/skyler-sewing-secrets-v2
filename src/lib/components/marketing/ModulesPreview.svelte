<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base
	   path, as in legacy; most targets are routes added by later phases, which typed resolve()
	   rejects. */
	import { Badge } from '#lib/components/ui/index.ts';
	import OptimizedImage from '#lib/components/ui/OptimizedImage.svelte';
	import { reveal } from '#lib/actions/reveal.ts';
	import { moduleStats, type MarketingOutline } from './outline.ts';

	interface Props {
		/** The published course outline from `content.outline()`. */
		outline: MarketingOutline;
	}

	let { outline }: Props = $props();

	const modules = $derived(
		outline.modules.map((module) => ({ ...module, stats: moduleStats(module) }))
	);
</script>

<section class="section relative isolate">
	<div class="container-default">
		<div class="max-w-2xl" use:reveal>
			<span class="eyebrow-sage">Course overview</span>
			<h2 class="section-title mt-6">{modules.length} modules</h2>
			<p class="section-description mt-5 max-w-reading">
				Designed to complete each other in order to create a seamless experience, you'll master the
				skills while unlocking your inner artist, because here, sewing truly becomes art.
			</p>
		</div>

		<div class="mt-16 grid grid-cols-1 gap-5 sm:mt-20 sm:grid-cols-2 lg:grid-cols-3">
			{#each modules as module, index (module.id)}
				<a
					href="/modules/{module.slug}"
					class="group shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-1 hover:shadow-lift"
					use:reveal={{ delay: 60 * (index % 3) }}
				>
					<div class="core flex h-full flex-col overflow-hidden">
						<div class="overflow-hidden rounded-t-core">
							{#if module.thumbnailUrl}
								<OptimizedImage
									src={module.thumbnailUrl}
									alt={module.title}
									width={600}
									sizes="(min-width: 1024px) 33vw, 100vw"
									class="aspect-[4/3] w-full object-cover transition-transform duration-1000 ease-fluid group-hover:scale-[1.04]"
								/>
							{:else}
								<div class="flex aspect-[4/3] w-full items-center justify-center bg-ivory-200">
									<span class="font-serif text-[3rem] leading-none text-charcoal-300">
										{index + 1}
									</span>
								</div>
							{/if}
						</div>

						<div class="flex flex-1 flex-col p-6 sm:p-7">
							<Badge variant={module.isBonus ? 'yellow' : 'sage'} size="sm">
								{module.isBonus ? 'Bonus' : `Module ${index + 1}`}
							</Badge>

							<h3 class="card-title mt-4">{module.title}</h3>

							<p class="mt-3 flex-auto text-[13px] text-charcoal-500">
								{module.stats.videos} videos · {module.stats.minutes} min{#if module.stats.slides > 0}
									· {module.stats.slides} slides{/if}
							</p>

							<span
								class="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-800"
							>
								Open module
								<span
									class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-charcoal-900/[0.06] transition-transform duration-400 ease-spring group-hover:translate-x-1"
								>
									<svg
										class="h-3 w-3"
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
									</svg>
								</span>
							</span>
						</div>
					</div>
				</a>
			{/each}
		</div>

		<div class="mt-14 flex justify-center" use:reveal>
			<a href="/modules" class="btn-secondary group">
				View all modules and tutorials
				<span class="btn-orb" aria-hidden="true">
					<svg
						class="h-3.5 w-3.5"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.25"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
					</svg>
				</span>
			</a>
		</div>
	</div>
</section>
