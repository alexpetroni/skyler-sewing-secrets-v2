<script lang="ts">
	import type { PageData } from './$types';
	import VideoPlayer from '$lib/components/course/VideoPlayer.svelte';
	import LessonSidebar from '$lib/components/course/LessonSidebar.svelte';
	import LessonResources from '$lib/components/course/LessonResources.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let isCompleting = $state(false);
	let lessonListOpen = $state(false);

	const currentIndex = $derived(data.module.lessons.findIndex((l) => l.slug === data.lesson.slug));
	const prevLesson = $derived(currentIndex > 0 ? data.module.lessons[currentIndex - 1] : null);
	const nextLesson = $derived(
		currentIndex < data.module.lessons.length - 1 ? data.module.lessons[currentIndex + 1] : null
	);

	async function markComplete() {
		if (isCompleting || data.lesson.progress?.completed) return;

		isCompleting = true;
		try {
			const response = await fetch('/api/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lessonId: data.lesson.id })
			});

			if (response.ok) {
				data.lesson.progress = { completed: true, completed_at: new Date().toISOString() };
			}
		} catch (error) {
			console.error('Failed to mark lesson complete:', error);
		} finally {
			isCompleting = false;
		}
	}

	function canAccessLesson(lesson: (typeof data.module.lessons)[0]): boolean {
		return data.profile?.is_member || lesson.is_free_preview;
	}
</script>

<svelte:head>
	<title>{data.lesson.title} - {data.module.title} - Skyler's Sewing Secrets</title>
	<meta name="description" content={data.lesson.description || `Watch ${data.lesson.title} in ${data.module.title}.`} />
</svelte:head>

<div class="container-wide py-10 sm:py-14">
	<nav aria-label="Breadcrumb" class="mb-8">
		<ol class="flex flex-wrap items-center gap-2 text-[12px] text-charcoal-400">
			<li>
				<a href="/modules" class="transition-colors duration-400 ease-fluid hover:text-charcoal-800">Modules</a>
			</li>
			<li aria-hidden="true">/</li>
			<li>
				<a href="/modules/{data.module.slug}" class="transition-colors duration-400 ease-fluid hover:text-charcoal-800">
					{data.module.title}
				</a>
			</li>
			<li aria-hidden="true">/</li>
			<li class="truncate text-charcoal-700">{data.lesson.title}</li>
		</ol>
	</nav>

	<div class="grid gap-8 lg:grid-cols-12 lg:gap-10">
		<!-- The lesson itself leads; the index follows it in the DOM on mobile. -->
		<main class="lg:col-span-8 xl:col-span-9">
			{#if data.lesson.video_url}
				<div class="shell-lg shadow-float">
					<div class="core-lg overflow-hidden">
						<VideoPlayer embedUrl={data.embedUrl} title={data.lesson.title} class="rounded-none" />
					</div>
				</div>
			{/if}

			<div class="mt-10 flex flex-wrap items-start justify-between gap-5">
				<div class="min-w-0">
					<h1 class="font-serif text-[2rem] leading-tight text-charcoal-900 sm:text-[2.5rem]">
						{data.lesson.title}
					</h1>
					{#if data.lesson.duration_minutes}
						<p class="mt-3 text-[11px] uppercase tracking-eyebrow text-charcoal-400">
							{data.lesson.duration_minutes} minutes
						</p>
					{/if}
				</div>

				{#if data.profile?.is_member}
					{#if data.lesson.progress?.completed}
						<span class="inline-flex shrink-0 items-center gap-2 rounded-full bg-sage-100 px-4 py-2 text-[13px] font-medium text-sage-700 ring-1 ring-inset ring-sage-700/12">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
								<path d="m3.5 8.5 3 3 6-7" />
							</svg>
							Completed
						</span>
					{:else}
						<button type="button" class="btn-secondary btn-sm shrink-0" onclick={markComplete} disabled={isCompleting}>
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

			{#if data.lesson.content}
				<div class="prose-editorial mt-10">
					{@html data.lesson.content}
				</div>
			{/if}

			{#if data.lesson.resources && data.lesson.resources.length > 0}
				<LessonResources resources={data.lesson.resources} />
			{/if}

			<div class="mt-14 flex items-stretch justify-between gap-4 border-t border-charcoal-900/[0.07] pt-8">
				{#if prevLesson && canAccessLesson(prevLesson)}
					<a
						href="/modules/{data.module.slug}/{prevLesson.slug}"
						class="group flex min-w-0 items-center gap-3 text-left"
					>
						<span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:-translate-x-1">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
							</svg>
						</span>
						<span class="min-w-0">
							<span class="block text-[10px] uppercase tracking-eyebrow text-charcoal-400">Previous</span>
							<span class="block truncate text-[14px] font-medium text-charcoal-800">{prevLesson.title}</span>
						</span>
					</a>
				{:else}
					<span></span>
				{/if}

				{#if nextLesson && canAccessLesson(nextLesson)}
					<a
						href="/modules/{data.module.slug}/{nextLesson.slug}"
						class="group flex min-w-0 items-center gap-3 text-right"
					>
						<span class="min-w-0">
							<span class="block text-[10px] uppercase tracking-eyebrow text-charcoal-400">Next</span>
							<span class="block truncate text-[14px] font-medium text-charcoal-800">{nextLesson.title}</span>
						</span>
						<span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:translate-x-1">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
							</svg>
						</span>
					</a>
				{:else if !data.profile?.is_member && nextLesson}
					<a href="/checkout" class="btn-primary btn-sm group shrink-0">
						Unlock remaining lessons
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
							</svg>
						</span>
					</a>
				{:else}
					<a href="/modules/{data.module.slug}" class="btn-ghost btn-sm group shrink-0">
						Back to module
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
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
				Tutorials in this module
				<span class="btn-orb transition-transform duration-600 ease-fluid {lessonListOpen ? 'rotate-180' : ''}" aria-hidden="true">
					<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="m4 6 4 4 4-4" />
					</svg>
				</span>
			</button>

			<div class="{lessonListOpen ? 'mt-4 block' : 'hidden'} lg:sticky lg:top-28 lg:mt-0 lg:block">
				<LessonSidebar
					module={data.module}
					currentLessonSlug={data.lesson.slug}
					isMember={data.profile?.is_member ?? false}
				/>
			</div>
		</aside>
	</div>
</div>
