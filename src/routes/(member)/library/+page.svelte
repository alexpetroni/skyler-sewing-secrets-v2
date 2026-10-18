<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { reveal } from '#lib/actions/reveal.ts';
	import Seo from '#lib/components/Seo.svelte';
	import ProgressBar from '#lib/components/course/ProgressBar.svelte';
	import { durationMinutes, formatMinutes } from '#lib/shared/lessons.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const KIND_LABELS = { course: 'Course', bundle: 'Bundle', single: 'Video' } as const;

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}

	const overallProgress = $derived(
		data.summary.lessons > 0
			? Math.round((data.summary.completedLessons / data.summary.lessons) * 100)
			: 0
	);
</script>

<Seo
	title="My Library - Skyler's Sewing Secrets"
	description="Everything you own at Skyler's Sewing Secrets, with your progress."
	noindex
/>

<section class="relative isolate overflow-hidden">
	<div
		class="aurora -top-28 left-[-8%] h-[26rem] w-[26rem] bg-sage-200/35"
		aria-hidden="true"
	></div>

	<div class="container-default pt-12 pb-12 sm:pt-16">
		<span class="eyebrow-sage">Your studio</span>
		<h1 class="page-title mt-6 text-balance">
			Welcome back, {data.name || 'Sewist'}
		</h1>
		<p class="section-description mt-5 max-w-reading">
			Continue your sewing journey where you left off — nothing here expires.
		</p>
	</div>
</section>

<section class="container-default pb-24 sm:pb-32">
	<!-- Stat bento: the headline figure takes the wide cell. -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
		<div class="shell shadow-ambient sm:col-span-2" use:reveal>
			<div class="core h-full p-7">
				<p class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Tutorials completed</p>
				<div class="mt-4 flex items-baseline gap-3">
					<span class="font-serif text-[3rem] leading-none text-charcoal-900">
						{data.summary.completedLessons}
					</span>
					<span class="text-[15px] text-charcoal-400">of {data.summary.lessons}</span>
				</div>
				<ProgressBar value={overallProgress} size="md" class="mt-6" showPercentage />
			</div>
		</div>

		<div class="shell shadow-ambient" use:reveal={{ delay: 60 }}>
			<div class="core h-full p-7">
				<p class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">In your library</p>
				<div class="mt-4 flex items-baseline gap-2">
					<span class="font-serif text-[2.5rem] leading-none text-charcoal-900">
						{data.summary.products}
					</span>
					<span class="text-[14px] text-charcoal-400">
						{data.summary.products === 1 ? 'product' : 'products'}
					</span>
				</div>
				<p class="mt-3 text-[13px] text-charcoal-500">yours for life</p>
			</div>
		</div>

		<div class="shell-sage shadow-ambient" use:reveal={{ delay: 120 }}>
			<div class="core h-full p-6">
				<p class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Time invested</p>
				<p class="mt-3 font-serif text-[1.75rem] leading-none text-charcoal-900">
					{formatMinutes(data.summary.minutesWatched)}
				</p>
			</div>
		</div>
	</div>

	<div class="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
		<!-- Continue -->
		<div class="lg:col-span-2">
			<h2 class="flex items-center gap-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
				Continue learning
				<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
			</h2>

			{#if data.continueWatching.length > 0}
				<div class="mt-6 space-y-3">
					{#each data.continueWatching as item, index (item.lessonId)}
						{@const minutes = durationMinutes(item.durationSeconds)}
						<a
							href={item.href}
							class="group shell block shadow-ambient transition-all duration-600 ease-fluid hover:-translate-y-0.5 hover:shadow-lift"
							use:reveal={{ delay: 40 * Math.min(index, 4) }}
						>
							<div class="core flex items-center gap-5 p-6">
								<div class="min-w-0 flex-1">
									<p class="text-[11px] tracking-eyebrow text-charcoal-400 uppercase">
										{item.moduleTitle ?? 'Video'}
									</p>
									<h3
										class="card-title mt-2 transition-colors duration-400 ease-fluid group-hover:text-brand-700"
									>
										{item.lessonTitle}
									</h3>
									{#if minutes}
										<p class="mt-3 text-[12px] text-charcoal-400 tabular-nums">
											{formatMinutes(minutes)}
										</p>
									{/if}
								</div>

								<span
									class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-charcoal-900 text-ivory-50 transition-transform duration-400 ease-spring group-hover:scale-105"
								>
									<svg class="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
										<path d="M8 5v14l11-7z" />
									</svg>
								</span>
							</div>
						</a>
					{/each}
				</div>
			{:else if data.summary.lessons > 0 && data.summary.completedLessons === data.summary.lessons}
				<div class="shell mt-6 shadow-ambient" use:reveal>
					<div class="core px-8 py-14 text-center">
						<span
							class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-sage-700"
						>
							<svg
								class="h-5 w-5"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.3"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="8" cy="8" r="6.25" />
								<path d="m5.5 8.25 1.75 1.75 3.25-4" />
							</svg>
						</span>
						<h3 class="subsection-heading mt-6">Every tutorial, finished</h3>
						<p class="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-charcoal-600">
							You've completed everything in your library. It stays here whenever you want to
							revisit a technique.
						</p>
					</div>
				</div>
			{:else}
				<div class="shell mt-6 shadow-ambient" use:reveal>
					<div class="core px-8 py-14 text-center">
						<span
							class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-charcoal-900 text-ivory-50"
						>
							<svg class="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M8 5v14l11-7z" />
							</svg>
						</span>
						<h3 class="subsection-heading mt-6">Start where it starts</h3>
						<p class="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-charcoal-600">
							Pick a tutorial below and press play — your place is saved as you watch.
						</p>
					</div>
				</div>
			{/if}

			{#each data.collections as collection (collection.slug)}
				<h2
					class="mt-12 flex items-center gap-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
				>
					{KIND_LABELS[collection.kind]} · {collection.title}
					<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
				</h2>
				<div class="shell mt-6 shadow-ambient" use:reveal>
					<div class="core overflow-hidden">
						<ul class="divide-y divide-charcoal-900/[0.06]">
							{#each collection.lessons as lesson (lesson.id)}
								{@const minutes = durationMinutes(lesson.durationSeconds)}
								<li>
									<a
										href={lesson.href}
										class="group flex items-center gap-3 p-4 transition-colors duration-400 ease-fluid hover:bg-ivory-100"
									>
										{#if lesson.completed}
											<svg
												class="h-5 w-5 shrink-0 text-sage-600"
												viewBox="0 0 16 16"
												fill="none"
												stroke="currentColor"
												stroke-width="1.35"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<circle cx="8" cy="8" r="6.25" />
												<path d="m5.5 8.25 1.75 1.75 3.25-4" />
											</svg>
										{:else}
											<span
												class="h-5 w-5 shrink-0 rounded-full ring-1 ring-charcoal-900/15 ring-inset"
											></span>
										{/if}
										<span class="min-w-0 flex-1 truncate text-[13px] font-medium text-charcoal-900">
											{lesson.title}
										</span>
										{#if minutes}
											<span class="shrink-0 text-[11px] text-charcoal-400 tabular-nums">
												{minutes}m
											</span>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/each}
		</div>

		<!-- Side rail -->
		<div class="space-y-10">
			<div>
				<h2
					class="flex items-center gap-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
				>
					Recently completed
					<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
				</h2>

				<div class="shell mt-6 shadow-ambient" use:reveal>
					<div class="core overflow-hidden">
						{#if data.recentlyCompleted.length > 0}
							<ul class="divide-y divide-charcoal-900/[0.06]">
								{#each data.recentlyCompleted as item (item.lessonId)}
									<li>
										<a
											href={item.href}
											class="flex items-start gap-3 p-4 transition-colors duration-400 ease-fluid hover:bg-ivory-100"
										>
											<svg
												class="mt-0.5 h-4 w-4 shrink-0 text-sage-600"
												viewBox="0 0 16 16"
												fill="none"
												stroke="currentColor"
												stroke-width="1.35"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<circle cx="8" cy="8" r="6.25" />
												<path d="m5.5 8.25 1.75 1.75 3.25-4" />
											</svg>
											<span class="min-w-0 flex-1">
												<span class="block truncate text-[13px] font-medium text-charcoal-900">
													{item.lessonTitle}
												</span>
												<span class="mt-0.5 block truncate text-[11px] text-charcoal-400">
													{item.moduleTitle ?? 'Video'}
												</span>
											</span>
											{#if item.completedAt}
												<span class="shrink-0 text-[11px] text-charcoal-400 tabular-nums">
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

			{#if data.course}
				<div>
					<h2
						class="flex items-center gap-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
					>
						Modules
						<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
					</h2>

					<div class="shell mt-6 shadow-ambient" use:reveal={{ delay: 80 }}>
						<div class="core overflow-hidden">
							<ul class="divide-y divide-charcoal-900/[0.06]">
								{#each data.course.modules as module (module.slug)}
									{@const progress =
										module.totalLessons > 0
											? Math.round((module.completedLessons / module.totalLessons) * 100)
											: 0}
									<li>
										<a
											href="/modules/{module.slug}"
											class="group flex items-center gap-3 p-4 transition-colors duration-400 ease-fluid hover:bg-ivory-100"
										>
											{#if progress === 100}
												<svg
													class="h-5 w-5 shrink-0 text-sage-600"
													viewBox="0 0 16 16"
													fill="none"
													stroke="currentColor"
													stroke-width="1.35"
													stroke-linecap="round"
													stroke-linejoin="round"
												>
													<circle cx="8" cy="8" r="6.25" />
													<path d="m5.5 8.25 1.75 1.75 3.25-4" />
												</svg>
											{:else if progress > 0}
												<span
													class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-sage-700 tabular-nums ring-1 ring-sage-500 ring-inset"
												>
													{progress}
												</span>
											{:else}
												<span
													class="h-5 w-5 shrink-0 rounded-full ring-1 ring-charcoal-900/15 ring-inset"
												></span>
											{/if}

											<span class="min-w-0 flex-1">
												<span class="block truncate text-[13px] font-medium text-charcoal-900">
													{module.title}
												</span>
												<span class="mt-0.5 block text-[11px] text-charcoal-400">
													{module.completedLessons}/{module.totalLessons} tutorials
												</span>
											</span>

											<span
												class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-charcoal-400 transition-transform duration-400 ease-spring group-hover:translate-x-0.5"
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
										</a>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</section>
