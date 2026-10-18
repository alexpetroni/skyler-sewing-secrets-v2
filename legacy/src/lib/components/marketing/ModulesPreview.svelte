<script lang="ts">
	import type { Module, Lesson } from '$lib/types';
	import { Badge } from '$lib/components/ui';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';
	import courseOverview from '$lib/data/course-overview';
	import { reveal } from '$lib/actions/reveal';

	interface ModuleWithLessons extends Module {
		lessons?: Pick<Lesson, 'id' | 'lesson_type' | 'duration_minutes' | 'is_published'>[];
	}

	interface Props {
		modules: ModuleWithLessons[];
	}

	let { modules }: Props = $props();

	function getModuleStats(module: ModuleWithLessons) {
		const publishedLessons = module.lessons?.filter((l) => l.is_published) || [];
		const videoCount = publishedLessons.filter((l) => l.lesson_type === 'video').length;
		const totalMinutes = publishedLessons.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);

		// Tutorial slides live in the static overview, not the database.
		const overviewData = courseOverview.modules.find((m) => m.slug === module.slug);
		const slides = overviewData?.tutorial_slides || 0;

		return { videos: videoCount, minutes: totalMinutes, slides };
	}
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
			{#each modules as module, index}
				<a
					href="/modules/{module.slug}"
					class="group shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-1 hover:shadow-lift"
					use:reveal={{ delay: 60 * (index % 3) }}
				>
					<div class="core flex h-full flex-col overflow-hidden">
						<div class="overflow-hidden rounded-t-core">
							{#if module.thumbnail_url}
								<OptimizedImage
									src={module.thumbnail_url}
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
							<Badge variant={module.is_bonus ? 'yellow' : 'sage'} size="sm">
								{#snippet children()}
									{module.is_bonus ? 'Bonus' : `Module ${index + 1}`}
								{/snippet}
							</Badge>

							<h3 class="card-title mt-4">{module.title}</h3>

							<p class="mt-3 flex-auto text-[13px] text-charcoal-500">
								{getModuleStats(module).videos} videos · {getModuleStats(module).minutes} min{#if getModuleStats(module).slides > 0}
									· {getModuleStats(module).slides} slides{/if}
							</p>

							<span class="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-800">
								Open module
								<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-charcoal-900/[0.06] transition-transform duration-400 ease-spring group-hover:translate-x-1">
									<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
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
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
					</svg>
				</span>
			</a>
		</div>
	</div>
</section>
