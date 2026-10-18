<script lang="ts">
	import courseOverview from '$lib/data/course-overview';
	import { reveal } from '$lib/actions/reveal';

	const modules = courseOverview.modules;
	const totals = courseOverview.totals;

	// Asymmetric bento — the row rhythm breaks deliberately so the grid never
	// reads as a table of equal boxes. Collapses to one column below md.
	const spans = [
		'lg:col-span-4',
		'lg:col-span-2',
		'lg:col-span-2',
		'lg:col-span-4',
		'lg:col-span-3',
		'lg:col-span-3'
	];

	function spanFor(index: number, isBonus: boolean) {
		return isBonus ? 'lg:col-span-6' : spans[index % spans.length];
	}
</script>

<section class="section relative isolate overflow-hidden">
	<div class="aurora right-[-12%] top-24 h-[30rem] w-[30rem] bg-sage-200/35" aria-hidden="true"></div>

	<div class="container-default">
		<div class="max-w-3xl" use:reveal>
			<span class="eyebrow-sage">The curriculum</span>
			<h2 class="section-title mt-6 text-balance">
				{modules.length} modules, {totals.videos} videos and {totals.slides} slide tutorials
			</h2>
			<p class="section-description mt-6 max-w-reading">
				Each module builds upon the last to create a seamless learning experience. You'll master the
				skills while unlocking your inner artist, because here, sewing truly becomes art.
			</p>
		</div>

		<div class="mt-16 grid grid-cols-1 gap-5 sm:mt-20 md:grid-cols-2 lg:grid-cols-6">
			{#each modules as module, index}
				<article
					class="group {spanFor(index, module.is_bonus)} shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-1 hover:shadow-lift"
					use:reveal={{ delay: 60 * (index % 3) }}
				>
					<div class="core flex h-full flex-col p-7 sm:p-8">
						<div class="flex items-center gap-3">
							<span
								class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-[15px] {module.is_bonus
									? 'bg-gold-400/20 text-gold-700 ring-1 ring-inset ring-gold-600/25'
									: 'bg-sage-100 text-sage-700 ring-1 ring-inset ring-sage-700/12'}"
							>
								{module.is_bonus ? '★' : module.number}
							</span>
							<span class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">
								{module.is_bonus ? 'Bonus module' : `Module ${module.number}`}
							</span>
						</div>

						<h3 class="card-title mt-5">{module.title}</h3>

						<p class="mt-3 flex-auto text-pretty text-[15px] leading-[1.7] text-charcoal-600">
							{module.description}
						</p>

						<div class="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-charcoal-900/[0.06] pt-5 text-[12px] text-charcoal-500">
							<span class="inline-flex items-center gap-1.5">
								<svg class="h-3.5 w-3.5 text-charcoal-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
									<rect x="1.75" y="3.75" width="12.5" height="8.5" rx="2" />
									<path d="M6.5 6.75 10 8l-3.5 1.25V6.75Z" />
								</svg>
								{module.videos} videos
							</span>
							<span class="inline-flex items-center gap-1.5">
								<svg class="h-3.5 w-3.5 text-charcoal-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="8" cy="8" r="6.25" />
									<path d="M8 4.75V8l2.25 1.5" />
								</svg>
								{module.minutes} min
							</span>
							{#if module.tutorial_slides > 0}
								<span class="inline-flex items-center gap-1.5">
									<svg class="h-3.5 w-3.5 text-charcoal-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
										<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2" />
										<path d="M5.25 6.25h5.5M5.25 9.25h3.5" />
									</svg>
									{module.tutorial_slides} slides
								</span>
							{/if}
						</div>
					</div>
				</article>
			{/each}
		</div>

		<div class="mt-14 flex justify-center" use:reveal>
			<a href="/modules" class="btn-secondary group">
				View all modules and lessons
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
					</svg>
				</span>
			</a>
		</div>
	</div>
</section>
