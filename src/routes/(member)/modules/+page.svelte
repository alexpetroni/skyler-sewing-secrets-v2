<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { reveal } from '#lib/actions/reveal.ts';
	import Seo from '#lib/components/Seo.svelte';
	import ProgressBar from '#lib/components/course/ProgressBar.svelte';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { Badge } from '#lib/components/ui/index.ts';
	import { formatMinutes } from '#lib/shared/lessons.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type OutlineModule = (typeof data.modules)[number];

	function completedCount(module: OutlineModule): number {
		return module.lessons.filter((lesson) => lesson.completed).length;
	}

	function progress(module: OutlineModule): number {
		const total = module.lessons.length;
		return total === 0 ? 0 : Math.round((completedCount(module) / total) * 100);
	}

	function totalDuration(module: OutlineModule): string {
		const seconds = module.lessons.reduce((sum, lesson) => sum + (lesson.durationSeconds ?? 0), 0);
		const minutes = Math.round(seconds / 60);
		return minutes > 0 ? formatMinutes(minutes) : '';
	}

	const totalLessons = $derived(
		data.modules.reduce((sum, module) => sum + module.lessons.length, 0)
	);
	const description = $derived(
		`Browse all ${data.modules.length} modules in Skyler's Sewing Secrets. From basics to advanced couture techniques.`
	);
</script>

<Seo title="Tutorials - Skyler's Sewing Secrets" {description} />

<PageHeader
	eyebrow="The course"
	title="Course modules"
	lede="{data.modules
		.length} modules covering everything from essential basics to advanced couture techniques, in the order you'd actually meet them at the machine."
>
	{#if !data.ownsCourse && data.flagship}
		<a href="/products/{data.flagship.slug}" class="btn-primary btn-lg group">
			Get full access
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
					<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
				</svg>
			</span>
		</a>
	{/if}
</PageHeader>

<section class="container-default pb-24 sm:pb-32">
	<!-- Index rows rather than cards: this is a table of contents, so it reads as one. -->
	<div class="space-y-4">
		{#each data.modules as module, index (module.id)}
			<a
				href="/modules/{module.slug}"
				class="group shell block shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-0.5 hover:shadow-lift"
				use:reveal={{ delay: 40 * Math.min(index, 4) }}
			>
				<div class="core flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
					<span
						class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-serif text-[1.5rem] leading-none {module.isBonus
							? 'bg-gold-400/15 text-gold-700 ring-1 ring-gold-600/20 ring-inset'
							: 'bg-sage-100 text-sage-700 ring-1 ring-sage-700/10 ring-inset'}"
					>
						{module.isBonus ? '★' : index + 1}
					</span>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
							<Badge variant={module.isBonus ? 'yellow' : 'gray'} size="sm">
								{module.isBonus ? 'Bonus' : `Module ${index + 1}`}
							</Badge>
							{#if module.lessons.length > 0}
								<span class="text-[12px] text-charcoal-500">{module.lessons.length} tutorials</span>
							{/if}
							{#if totalDuration(module)}
								<span class="text-[12px] text-charcoal-400">· {totalDuration(module)}</span>
							{/if}
						</div>

						<h2
							class="card-title mt-3 transition-colors duration-400 ease-fluid group-hover:text-brand-700"
						>
							{module.title}
						</h2>

						{#if module.description}
							<p
								class="mt-2 line-clamp-2 max-w-reading text-[15px] leading-relaxed text-charcoal-600"
							>
								{module.description}
							</p>
						{/if}

						{#if module.owned}
							<div class="mt-5 max-w-sm">
								<ProgressBar
									value={progress(module)}
									label="{completedCount(module)} of {module.lessons.length} completed"
									showPercentage
								/>
							</div>
						{:else if module.lessons.some((lesson) => lesson.isFreePreview)}
							<span
								class="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-sage-700"
							>
								<svg
									class="h-3.5 w-3.5"
									viewBox="0 0 16 16"
									fill="none"
									stroke="currentColor"
									stroke-width="1.2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<circle cx="8" cy="8" r="6.25" />
									<path d="M6.75 5.75 10.5 8l-3.75 2.25v-4.5Z" />
								</svg>
								Free preview available
							</span>
						{/if}
					</div>

					<span
						class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:translate-x-1 sm:inline-flex"
					>
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
				</div>
			</a>
		{/each}
	</div>

	{#if !data.ownsCourse && data.flagship}
		<div
			class="mt-16 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-charcoal-900/[0.06] ring-inset sm:px-12"
			use:reveal
		>
			<h2 class="section-title text-balance">Ready to start learning?</h2>
			<p class="section-description mx-auto mt-5 max-w-xl">
				Lifetime access to all {data.modules.length} modules and {totalLessons} tutorials, for one payment.
			</p>
			<a href="/products/{data.flagship.slug}" class="btn-primary btn-lg group mt-9">
				Enrol now
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
						<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
					</svg>
				</span>
			</a>
		</div>
	{/if}
</section>
