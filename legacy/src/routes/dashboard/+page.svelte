<script lang="ts">
	import type { PageData } from './$types';
	import { ProgressBar } from '$lib/components/course';
	import { Alert } from '$lib/components/ui';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatDuration(minutes: number): string {
		if (minutes < 60) return `${minutes} min`;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}

	const overallProgress = $derived(
		data.stats.totalLessons > 0
			? Math.round((data.stats.completedLessons / data.stats.totalLessons) * 100)
			: 0
	);
</script>

<svelte:head>
	<title>My Dashboard - Skyler's Sewing Secrets</title>
	<meta name="description" content="Track your sewing course progress, continue learning, and access all your tutorials from your personal dashboard." />
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="relative isolate overflow-hidden">
	<div class="aurora -top-28 left-[-8%] h-[26rem] w-[26rem] bg-sage-200/35" aria-hidden="true"></div>

	<div class="container-default pb-12 pt-12 sm:pt-16">
		<span class="eyebrow-sage">Your studio</span>
		<h1 class="page-title mt-6 text-balance">
			Welcome back, {data.user.full_name || 'Sewist'}
		</h1>
		<p class="section-description mt-5 max-w-reading">
			Continue your sewing journey where you left off — nothing here expires.
		</p>

		{#if data.user.is_suspended}
			<div class="mt-8 max-w-reading">
				<Alert variant="warning" title="Account suspended">
					{#snippet children()}
						Your access has been suspended. If you think this is a mistake, <a href="/contact" class="link">get in touch</a>.
					{/snippet}
				</Alert>
			</div>
		{/if}
	</div>
</section>

<section class="container-default pb-24 sm:pb-32">
	<!-- Stat bento: the headline figure takes the wide cell. -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
		<div class="shell shadow-ambient sm:col-span-2" use:reveal>
			<div class="core h-full p-7">
				<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Tutorials completed</p>
				<div class="mt-4 flex items-baseline gap-3">
					<span class="font-serif text-[3rem] leading-none text-charcoal-900">
						{data.stats.completedLessons}
					</span>
					<span class="text-[15px] text-charcoal-400">of {data.stats.totalLessons}</span>
				</div>
				<ProgressBar value={overallProgress} size="md" class="mt-6" showPercentage />
			</div>
		</div>

		<div class="shell shadow-ambient" use:reveal={{ delay: 60 }}>
			<div class="core h-full p-7">
				<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Modules</p>
				<div class="mt-4 flex items-baseline gap-2">
					<span class="font-serif text-[2.5rem] leading-none text-charcoal-900">
						{data.stats.completedModules}
					</span>
					<span class="text-[14px] text-charcoal-400">/ {data.stats.totalModules}</span>
				</div>
				<p class="mt-3 text-[13px] text-charcoal-500">completed end to end</p>
			</div>
		</div>

		<div class="grid gap-5" use:reveal={{ delay: 120 }}>
			<div class="shell-sage shadow-ambient">
				<div class="core h-full p-6">
					<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Time invested</p>
					<p class="mt-3 font-serif text-[1.75rem] leading-none text-charcoal-900">
						{formatDuration(data.stats.totalMinutesWatched)}
					</p>
				</div>
			</div>
			<div class="shell shadow-ambient">
				<div class="core h-full p-6">
					<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Member since</p>
					<p class="mt-3 font-serif text-[1.75rem] leading-none text-charcoal-900">
						{data.user.member_since ? formatDate(data.user.member_since) : 'Today'}
					</p>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
		<!-- Continue -->
		<div class="lg:col-span-2">
			<h2 class="flex items-center gap-4 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
				Continue learning
				<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
			</h2>

			{#if data.continueWatching.length > 0}
				<div class="mt-6 space-y-3">
					{#each data.continueWatching as item, index}
						<a
							href="/modules/{item.module.slug}/{item.lesson.slug}"
							class="group block shell shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-0.5 hover:shadow-lift"
							use:reveal={{ delay: 40 * Math.min(index, 4) }}
						>
							<div class="core flex items-center gap-5 p-6">
								<div class="min-w-0 flex-1">
									<p class="text-[11px] uppercase tracking-eyebrow text-charcoal-400">
										{item.module.title}
									</p>
									<h3 class="card-title mt-2 transition-colors duration-400 ease-fluid group-hover:text-brand-700">
										{item.lesson.title}
									</h3>
									{#if item.lesson.description}
										<p class="mt-2 line-clamp-2 text-[14px] leading-relaxed text-charcoal-500">
											{item.lesson.description}
										</p>
									{/if}
									{#if item.lesson.duration_minutes}
										<p class="mt-3 text-[12px] tabular-nums text-charcoal-400">
											{formatDuration(item.lesson.duration_minutes)}
										</p>
									{/if}
								</div>

								<span class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-charcoal-900 text-ivory-50 transition-transform duration-400 ease-spring group-hover:scale-105">
									<svg class="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
										<path d="M8 5v14l11-7z" />
									</svg>
								</span>
							</div>
						</a>
					{/each}
				</div>
			{:else if data.stats.completedLessons === data.stats.totalLessons}
				<div class="mt-6 shell shadow-ambient" use:reveal>
					<div class="core px-8 py-14 text-center">
						<span class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-sage-700">
							<svg class="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="8" cy="8" r="6.25" />
								<path d="m5.5 8.25 1.75 1.75 3.25-4" />
							</svg>
						</span>
						<h3 class="subsection-heading mt-6">Every tutorial, finished</h3>
						<p class="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-charcoal-600">
							You've completed the whole course. It stays here whenever you want to revisit a
							technique.
						</p>
					</div>
				</div>
			{:else}
				<div class="mt-6 shell shadow-ambient" use:reveal>
					<div class="core px-8 py-14 text-center">
						<span class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-charcoal-900 text-ivory-50">
							<svg class="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M8 5v14l11-7z" />
							</svg>
						</span>
						<h3 class="subsection-heading mt-6">Start where it starts</h3>
						<p class="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-charcoal-600">
							Begin your sewing journey with Module 1 — tools, cutting, and the stitches everything
							else rests on.
						</p>
						<a href="/modules" class="btn-primary group mt-8">
							Browse modules
							<span class="btn-orb" aria-hidden="true">
								<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
								</svg>
							</span>
						</a>
					</div>
				</div>
			{/if}
		</div>

		<!-- Side rail -->
		<div class="space-y-10">
			<div>
				<h2 class="flex items-center gap-4 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
					Recently completed
					<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
				</h2>

				<div class="mt-6 shell shadow-ambient" use:reveal>
					<div class="core overflow-hidden">
						{#if data.recentlyCompleted.length > 0}
							<ul class="divide-y divide-charcoal-900/[0.06]">
								{#each data.recentlyCompleted as item}
									<li>
										<a
											href="/modules/{item.module.slug}/{item.lesson.slug}"
											class="flex items-start gap-3 p-4 transition-colors duration-400 ease-fluid hover:bg-ivory-100"
										>
											<svg class="mt-0.5 h-4 w-4 shrink-0 text-sage-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
												<circle cx="8" cy="8" r="6.25" />
												<path d="m5.5 8.25 1.75 1.75 3.25-4" />
											</svg>
											<span class="min-w-0 flex-1">
												<span class="block truncate text-[13px] font-medium text-charcoal-900">
													{item.lesson.title}
												</span>
												<span class="mt-0.5 block truncate text-[11px] text-charcoal-400">
													{item.module.title}
												</span>
											</span>
											{#if item.completedAt}
												<span class="shrink-0 text-[11px] tabular-nums text-charcoal-400">
													{formatDate(item.completedAt)}
												</span>
											{/if}
										</a>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="p-7 text-center text-[13px] text-charcoal-500">No completed lessons yet.</p>
						{/if}
					</div>
				</div>
			</div>

			<div>
				<h2 class="flex items-center gap-4 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
					Modules
					<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
				</h2>

				<div class="mt-6 shell shadow-ambient" use:reveal={{ delay: 80 }}>
					<div class="core overflow-hidden">
						<ul class="divide-y divide-charcoal-900/[0.06]">
							{#each data.modules as module}
								<li>
									<a
										href="/modules/{module.slug}"
										class="group flex items-center gap-3 p-4 transition-colors duration-400 ease-fluid hover:bg-ivory-100"
									>
										{#if module.progress === 100}
											<svg class="h-5 w-5 shrink-0 text-sage-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
												<circle cx="8" cy="8" r="6.25" />
												<path d="m5.5 8.25 1.75 1.75 3.25-4" />
											</svg>
										{:else if module.progress > 0}
											<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums text-sage-700 ring-1 ring-inset ring-sage-500">
												{module.progress}
											</span>
										{:else}
											<span class="h-5 w-5 shrink-0 rounded-full ring-1 ring-inset ring-charcoal-900/15"></span>
										{/if}

										<span class="min-w-0 flex-1">
											<span class="block truncate text-[13px] font-medium text-charcoal-900">
												{module.title}
											</span>
											<span class="mt-0.5 block text-[11px] text-charcoal-400">
												{module.completedCount}/{module.lessonCount} tutorials
											</span>
										</span>

										<span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-charcoal-400 transition-transform duration-400 ease-spring group-hover:translate-x-0.5">
											<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
												<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
											</svg>
										</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
