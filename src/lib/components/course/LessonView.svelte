<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { durationMinutes } from '#lib/shared/lessons.ts';
	import LessonResources from './LessonResources.svelte';
	import LessonSidebar from './LessonSidebar.svelte';
	import LockedLesson from './LockedLesson.svelte';
	import ProgressHeartbeat from './ProgressHeartbeat.svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import type { LessonPage } from './types.ts';

	interface Props {
		data: LessonPage;
	}

	let { data }: Props = $props();

	let isCompleting = $state(false);
	let lessonListOpen = $state(false);
	// Optimistic once the endpoint confirms; reset by the next load.
	let completed = $derived(!data.locked && data.completed);

	const currentIndex = $derived(
		data.siblings.findIndex((sibling) => sibling.id === data.lesson.id)
	);
	const prevLesson = $derived(currentIndex > 0 ? data.siblings[currentIndex - 1] : null);
	const nextLesson = $derived(
		currentIndex >= 0 && currentIndex < data.siblings.length - 1
			? data.siblings[currentIndex + 1]
			: null
	);
	const minutes = $derived(data.locked ? null : durationMinutes(data.durationSeconds));
	const back = $derived(
		data.module
			? { href: `/modules/${data.module.slug}`, label: 'Back to module', title: data.module.title }
			: { href: '/catalogue', label: 'Back to catalogue', title: 'More videos' }
	);

	async function markComplete() {
		if (isCompleting || completed) return;
		isCompleting = true;
		try {
			const response = await fetch('/api/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lessonId: data.lesson.id, completed: true })
			});
			if (response.ok) completed = true;
		} finally {
			isCompleting = false;
		}
	}
</script>

<div class="container-wide py-10 sm:py-14">
	<nav aria-label="Breadcrumb" class="mb-8">
		<ol class="flex flex-wrap items-center gap-2 text-[12px] text-charcoal-400">
			{#if data.module}
				<li>
					<a
						href="/modules"
						class="transition-colors duration-400 ease-fluid hover:text-charcoal-800">Modules</a
					>
				</li>
				<li aria-hidden="true">/</li>
				<li>
					<a
						href="/modules/{data.module.slug}"
						class="transition-colors duration-400 ease-fluid hover:text-charcoal-800"
					>
						{data.module.title}
					</a>
				</li>
			{:else}
				<li>
					<a
						href="/catalogue"
						class="transition-colors duration-400 ease-fluid hover:text-charcoal-800">Videos</a
					>
				</li>
			{/if}
			<li aria-hidden="true">/</li>
			<li class="truncate text-charcoal-700">{data.lesson.title}</li>
		</ol>
	</nav>

	<div class="grid gap-8 lg:grid-cols-12 lg:gap-10">
		<!-- The lesson itself leads; the index follows it in the DOM on mobile. -->
		<main class="lg:col-span-8 xl:col-span-9">
			{#if data.locked}
				<LockedLesson
					title={data.lesson.title}
					description={data.lesson.description}
					cheapest={data.unlockOptions.cheapest}
					flagship={data.unlockOptions.flagship}
					signInHref={data.signInHref}
				/>
			{:else}
				{#if data.embedUrl}
					<div class="shell-lg shadow-float">
						<div class="core-lg overflow-hidden">
							<VideoPlayer
								embedUrl={data.embedUrl}
								startAt={data.startAt}
								title={data.lesson.title}
								class="rounded-none"
							/>
						</div>
					</div>
					{#if data.canTrackProgress}
						<ProgressHeartbeat
							lessonId={data.lesson.id}
							startAt={data.startAt}
							durationSeconds={data.durationSeconds}
						/>
					{/if}
				{/if}

				<div class="mt-10 flex flex-wrap items-start justify-between gap-5">
					<div class="min-w-0">
						<h1 class="font-serif text-[2rem] leading-tight text-charcoal-900 sm:text-[2.5rem]">
							{data.lesson.title}
						</h1>
						{#if minutes}
							<p class="mt-3 text-[11px] tracking-eyebrow text-charcoal-400 uppercase">
								{minutes} minutes
							</p>
						{/if}
					</div>

					{#if data.canTrackProgress}
						{#if completed}
							<span
								class="inline-flex shrink-0 items-center gap-2 rounded-full bg-sage-100 px-4 py-2 text-[13px] font-medium text-sage-700 ring-1 ring-sage-700/12 ring-inset"
							>
								<svg
									class="h-3.5 w-3.5"
									viewBox="0 0 16 16"
									fill="none"
									stroke="currentColor"
									stroke-width="1.4"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="m3.5 8.5 3 3 6-7" />
								</svg>
								Completed
							</span>
						{:else}
							<button
								type="button"
								class="btn-secondary btn-sm shrink-0"
								onclick={markComplete}
								disabled={isCompleting}
							>
								{isCompleting ? 'Saving…' : 'Mark complete'}
							</button>
						{/if}
					{/if}
				</div>

				{#if data.lesson.description}
					<p class="mt-6 max-w-reading text-[17px] leading-[1.8] text-charcoal-600">
						{data.lesson.description}
					</p>
				{/if}

				{#if data.contentHtml}
					<div class="prose-editorial mt-10">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitiser output (lessons.content_html) -->
						{@html data.contentHtml}
					</div>
				{/if}

				<LessonResources resources={data.resources} />
			{/if}

			<div
				class="mt-14 flex items-stretch justify-between gap-4 border-t border-charcoal-900/[0.07] pt-8"
			>
				{#if prevLesson && prevLesson.lockState !== 'suspended'}
					<a href={prevLesson.href} class="group flex min-w-0 items-center gap-3 text-left">
						<span
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:-translate-x-1"
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
								<path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
							</svg>
						</span>
						<span class="min-w-0">
							<span class="block text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
								>Previous</span
							>
							<span class="block truncate text-[14px] font-medium text-charcoal-800"
								>{prevLesson.title}</span
							>
						</span>
					</a>
				{:else}
					<span></span>
				{/if}

				{#if nextLesson && nextLesson.lockState !== 'suspended'}
					<a href={nextLesson.href} class="group flex min-w-0 items-center gap-3 text-right">
						<span class="min-w-0">
							<span class="block text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
								>Next</span
							>
							<span class="block truncate text-[14px] font-medium text-charcoal-800"
								>{nextLesson.title}</span
							>
						</span>
						<span
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:translate-x-1"
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
					</a>
				{:else}
					<a href={back.href} class="btn-ghost btn-sm group shrink-0">
						{back.label}
						<span class="btn-orb" aria-hidden="true">
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
				{/if}
			</div>
		</main>

		<!-- Index: sticky beside the video on desktop, a disclosure on mobile. -->
		<aside class="lg:col-span-4 xl:col-span-3">
			<button
				type="button"
				class="btn-secondary w-full justify-between lg:hidden"
				onclick={() => (lessonListOpen = !lessonListOpen)}
				aria-expanded={lessonListOpen}
			>
				{data.module ? 'Tutorials in this module' : 'More videos'}
				<span
					class="btn-orb transition-transform duration-600 ease-fluid {lessonListOpen
						? 'rotate-180'
						: ''}"
					aria-hidden="true"
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
						<path d="m4 6 4 4 4-4" />
					</svg>
				</span>
			</button>

			<div class="{lessonListOpen ? 'mt-4 block' : 'hidden'} lg:sticky lg:top-28 lg:mt-0 lg:block">
				<LessonSidebar
					title={back.title}
					backHref={back.href}
					backLabel={back.label}
					lessons={data.siblings}
					currentLessonId={data.lesson.id}
					showProgress={data.ownsAllSiblings}
				/>
			</div>
		</aside>
	</div>
</div>
