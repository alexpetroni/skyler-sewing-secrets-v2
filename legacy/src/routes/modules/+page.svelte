<script lang="ts">
	import type { PageData } from './$types';
	import { Badge } from '$lib/components/ui';
	import ProgressBar from '$lib/components/course/ProgressBar.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function getLessonCount(module: (typeof data.modules)[0]): number {
		return module.lessons?.length ?? 0;
	}

	function getCompletedCount(module: (typeof data.modules)[0]): number {
		if (!module.lessons) return 0;
		return module.lessons.filter((l) => l.progress?.completed).length;
	}

	function getProgress(module: (typeof data.modules)[0]): number {
		const total = getLessonCount(module);
		if (total === 0) return 0;
		return Math.round((getCompletedCount(module) / total) * 100);
	}

	function getTotalDuration(module: (typeof data.modules)[0]): string {
		if (!module.lessons) return '';
		const totalMinutes = module.lessons.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);
		if (totalMinutes < 60) return `${totalMinutes} min`;
		const hours = Math.floor(totalMinutes / 60);
		const mins = totalMinutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	const totalLessons = $derived(data.modules.reduce((sum, m) => sum + getLessonCount(m), 0));
</script>

<svelte:head>
	<title>Tutorials - Skyler's Sewing Secrets</title>
	<meta name="description" content="Browse all {data.modules.length} modules in Skyler's Sewing Secrets. From basics to advanced couture techniques." />
	<meta property="og:title" content="Course Modules - Skyler's Sewing Secrets" />
	<meta property="og:description" content="Browse all {data.modules.length} modules in Skyler's Sewing Secrets. From basics to advanced couture techniques." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/modules" />
</svelte:head>

<PageHeader
	eyebrow="The course"
	title="Course modules"
	lede="{data.modules.length} modules covering everything from essential basics to advanced couture techniques, in the order you'd actually meet them at the machine."
>
	{#snippet children()}
		{#if !data.profile}
			<a href="/checkout" class="btn-primary btn-lg group">
				Get full access
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
					</svg>
				</span>
			</a>
		{/if}
	{/snippet}
</PageHeader>

<section class="container-default pb-24 sm:pb-32">
	<!-- Index rows rather than cards: this is a table of contents, so it reads as one. -->
	<div class="space-y-4">
		{#each data.modules as module, index}
			<a
				href="/modules/{module.slug}"
				class="group block shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-0.5 hover:shadow-lift"
				use:reveal={{ delay: 40 * Math.min(index, 4) }}
			>
				<div class="core flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
					<span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-serif text-[1.5rem] leading-none {module.is_bonus
						? 'bg-gold-400/15 text-gold-700 ring-1 ring-inset ring-gold-600/20'
						: 'bg-sage-100 text-sage-700 ring-1 ring-inset ring-sage-700/10'}">
						{module.is_bonus ? '★' : index + 1}
					</span>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
							<Badge variant={module.is_bonus ? 'yellow' : 'gray'} size="sm">
								{#snippet children()}
									{module.is_bonus ? 'Bonus' : `Module ${index + 1}`}
								{/snippet}
							</Badge>
							{#if getLessonCount(module) > 0}
								<span class="text-[12px] text-charcoal-500">{getLessonCount(module)} tutorials</span>
							{/if}
							{#if getTotalDuration(module)}
								<span class="text-[12px] text-charcoal-400">· {getTotalDuration(module)}</span>
							{/if}
						</div>

						<h2 class="card-title mt-3 transition-colors duration-400 ease-fluid group-hover:text-brand-700">
							{module.title}
						</h2>

						{#if module.description}
							<p class="mt-2 line-clamp-2 max-w-reading text-[15px] leading-relaxed text-charcoal-600">
								{module.description}
							</p>
						{/if}

						{#if data.profile?.is_member && getLessonCount(module) > 0}
							<div class="mt-5 max-w-sm">
								<ProgressBar
									value={getProgress(module)}
									label="{getCompletedCount(module)} of {getLessonCount(module)} completed"
									showPercentage
								/>
							</div>
						{:else if !data.profile?.is_member && module.lessons?.some((l) => l.is_free_preview)}
							<span class="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-sage-700">
								<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="8" cy="8" r="6.25" />
									<path d="M6.75 5.75 10.5 8l-3.75 2.25v-4.5Z" />
								</svg>
								Free preview available
							</span>
						{/if}
					</div>

					<span class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:translate-x-1 sm:inline-flex">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
						</svg>
					</span>
				</div>
			</a>
		{/each}
	</div>

	{#if !data.profile?.is_member}
		<div class="mt-16 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-inset ring-charcoal-900/[0.06] sm:px-12" use:reveal>
			<h2 class="section-title text-balance">Ready to start learning?</h2>
			<p class="section-description mx-auto mt-5 max-w-xl">
				Lifetime access to all {data.modules.length} modules and {totalLessons} tutorials, for one payment.
			</p>
			<a href="/checkout" class="btn-primary btn-lg group mt-9">
				Enrol now
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
					</svg>
				</span>
			</a>
		</div>
	{/if}
</section>
