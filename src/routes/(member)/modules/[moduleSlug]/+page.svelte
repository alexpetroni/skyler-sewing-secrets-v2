<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { reveal } from '#lib/actions/reveal.ts';
	import Seo from '#lib/components/Seo.svelte';
	import ProgressBar from '#lib/components/course/ProgressBar.svelte';
	import { Badge } from '#lib/components/ui/index.ts';
	import { durationMinutes, formatMinutes } from '#lib/shared/lessons.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const completedCount = $derived(data.lessons.filter((lesson) => lesson.completed).length);
	const totalCount = $derived(data.lessons.length);
	const progressPercent = $derived(
		totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
	);
	const description = $derived(
		data.module.description ||
			`Learn ${data.module.title} with Skyler's professional sewing techniques.`
	);
</script>

<Seo
	title="{data.module.title} - Skyler's Sewing Secrets"
	{description}
	image={data.module.thumbnailUrl}
/>

<section class="relative isolate overflow-hidden">
	<div
		class="aurora -top-28 left-[-8%] h-[26rem] w-[26rem] bg-brand-200/30"
		aria-hidden="true"
	></div>

	<div class="container-default pt-14 pb-14 sm:pt-20">
		<nav aria-label="Breadcrumb">
			<ol class="flex items-center gap-2 text-[12px] text-charcoal-400">
				<li>
					<a
						href="/modules"
						class="transition-colors duration-400 ease-fluid hover:text-charcoal-800"
					>
						Modules
					</a>
				</li>
				<li aria-hidden="true">/</li>
				<li class="truncate text-charcoal-700">{data.module.title}</li>
			</ol>
		</nav>

		<div class="mt-10 max-w-3xl">
			<div class="flex flex-wrap items-center gap-3">
				<Badge variant={data.module.isBonus ? 'yellow' : 'gray'} size="sm">
					{data.module.isBonus ? 'Bonus module' : `Module ${data.module.orderIndex}`}
				</Badge>
				<span class="text-[12px] text-charcoal-500">{totalCount} tutorials</span>
			</div>

			<h1 class="page-title mt-6 text-balance">{data.module.title}</h1>

			{#if data.module.description}
				<p class="section-description mt-6 max-w-reading">{data.module.description}</p>
			{/if}

			{#if data.owned && totalCount > 0}
				<div class="mt-9 max-w-md">
					<ProgressBar
						value={progressPercent}
						size="md"
						showPercentage
						label="{completedCount} of {totalCount} tutorials completed"
					/>
				</div>
			{/if}
		</div>
	</div>
</section>

<section class="container-default pb-24 sm:pb-32">
	<h2 class="flex items-center gap-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
		Tutorials
		<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
	</h2>

	<div class="mt-7 space-y-3">
		{#each data.lessons as lesson, index (lesson.id)}
			{@const open = lesson.lockState === 'open'}
			{@const minutes = durationMinutes(lesson.durationSeconds)}
			<!-- A locked lesson still links: its page shows what unlocks it. -->
			<a
				href={lesson.lockState === 'suspended' ? undefined : lesson.href}
				class="group shell block transition-all duration-600 ease-fluid {open
					? 'shadow-ambient hover:-translate-y-0.5 hover:shadow-lift'
					: 'opacity-60 hover:opacity-80'}"
				use:reveal={{ delay: 30 * Math.min(index, 6) }}
			>
				<div class="core flex items-center gap-4 p-5 sm:gap-5 sm:p-6">
					<span
						class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-400 ease-fluid {lesson.completed
							? 'bg-sage-100 text-sage-700 ring-1 ring-sage-700/12 ring-inset'
							: open
								? 'bg-charcoal-900/[0.05] text-charcoal-600 group-hover:bg-charcoal-900/[0.09]'
								: 'bg-charcoal-900/[0.04] text-charcoal-400'}"
					>
						{#if lesson.completed}
							<svg
								class="h-4 w-4"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="m3.5 8.5 3 3 6-7" />
							</svg>
						{:else if open}
							<span class="font-serif text-[15px]">{index + 1}</span>
						{:else}
							<svg
								class="h-4 w-4"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-label="Locked"
							>
								<rect x="3.25" y="7" width="9.5" height="6.25" rx="1.75" />
								<path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" />
							</svg>
						{/if}
					</span>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h3
								class="truncate font-serif text-[1.125rem] font-medium text-charcoal-900 transition-colors duration-400 ease-fluid {open
									? 'group-hover:text-brand-700'
									: ''}"
							>
								{lesson.title}
							</h3>
							{#if lesson.isFreePreview && !lesson.owned}
								<Badge variant="sage" size="sm">Free preview</Badge>
							{/if}
						</div>
						{#if lesson.description}
							<p class="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-charcoal-500">
								{lesson.description}
							</p>
						{/if}
					</div>

					<div class="flex shrink-0 items-center gap-4">
						{#if minutes}
							<span class="hidden text-[12px] text-charcoal-400 tabular-nums sm:block">
								{formatMinutes(minutes)}
							</span>
						{/if}
						{#if open}
							<span
								class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:translate-x-1"
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
						{/if}
					</div>
				</div>
			</a>
		{/each}
	</div>

	{#if !data.owned && data.flagship}
		<div
			class="mt-14 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-charcoal-900/[0.06] ring-inset sm:px-12"
			use:reveal
		>
			<span
				class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-charcoal-500 shadow-ambient"
			>
				<svg
					class="h-5 w-5"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3.25" y="7" width="9.5" height="6.25" rx="1.75" />
					<path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" />
				</svg>
			</span>
			<h3 class="subsection-heading mt-6">Unlock all tutorials</h3>
			<p class="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-charcoal-600">
				Get lifetime access to this module and every other tutorial in the course.
			</p>
			<a href="/products/{data.flagship.slug}" class="btn-primary group mt-8">
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

	<div class="mt-14">
		<a
			href="/modules"
			class="group inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-500 transition-colors duration-400 ease-fluid hover:text-charcoal-900"
		>
			<span
				class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-900/[0.05] transition-transform duration-400 ease-spring group-hover:-translate-x-1"
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
					<path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
				</svg>
			</span>
			All modules
		</a>
	</div>
</section>
