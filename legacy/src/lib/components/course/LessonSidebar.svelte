<script lang="ts">
	import ProgressBar from './ProgressBar.svelte';

	interface SidebarLesson {
		slug: string;
		title: string;
		duration_minutes: number | null;
		is_free_preview: boolean;
		progress?: { completed: boolean } | null;
	}

	interface SidebarModule {
		slug: string;
		title: string;
		lessons: SidebarLesson[];
	}

	interface Props {
		module: SidebarModule;
		currentLessonSlug: string;
		isMember: boolean;
	}

	let { module, currentLessonSlug, isMember }: Props = $props();

	const completedCount = $derived(module.lessons.filter((l) => l.progress?.completed).length);
	const totalCount = $derived(module.lessons.length);
	const progressPercent = $derived(
		totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
	);

	function canAccess(lesson: SidebarLesson): boolean {
		return isMember || lesson.is_free_preview;
	}
</script>

<div class="shell shadow-ambient">
	<div class="core overflow-hidden">
		<div class="border-b border-charcoal-900/[0.06] p-6">
			<a
				href="/modules/{module.slug}"
				class="group inline-flex items-center gap-2 text-[12px] font-medium text-charcoal-500 transition-colors duration-400 ease-fluid hover:text-charcoal-900"
			>
				<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-charcoal-900/[0.05] transition-transform duration-400 ease-spring group-hover:-translate-x-0.5">
					<svg class="h-2.5 w-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
					</svg>
				</span>
				Back to module
			</a>

			<h2 class="mt-4 line-clamp-2 font-serif text-[1.25rem] leading-snug text-charcoal-900">
				{module.title}
			</h2>

			{#if isMember && totalCount > 0}
				<div class="mt-5">
					<ProgressBar value={progressPercent} label="{completedCount}/{totalCount} completed" showPercentage />
				</div>
			{/if}
		</div>

		<nav class="max-h-[60vh] overflow-y-auto p-2">
			<ul class="space-y-0.5">
				{#each module.lessons as lesson, index}
					{@const isActive = lesson.slug === currentLessonSlug}
					{@const accessible = canAccess(lesson)}
					<li>
						<a
							href={accessible ? `/modules/${module.slug}/${lesson.slug}` : '#'}
							class="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] transition-colors duration-400 ease-fluid {isActive
								? 'bg-sage-100/70 text-charcoal-900 ring-1 ring-inset ring-sage-700/10'
								: accessible
									? 'text-charcoal-600 hover:bg-ivory-100 hover:text-charcoal-900'
									: 'pointer-events-none text-charcoal-300'}"
							aria-current={isActive ? 'page' : undefined}
						>
							<span class="flex h-6 w-6 shrink-0 items-center justify-center">
								{#if lesson.progress?.completed}
									<svg class="h-4 w-4 text-sage-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
										<circle cx="8" cy="8" r="6.25" />
										<path d="m5.5 8.25 1.75 1.75 3.25-4" />
									</svg>
								{:else if !accessible}
									<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
										<rect x="3.25" y="7" width="9.5" height="6.25" rx="1.75" />
										<path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" />
									</svg>
								{:else}
									<span class="font-serif text-[13px] {isActive ? 'text-sage-700' : 'text-charcoal-400'}">
										{index + 1}
									</span>
								{/if}
							</span>

							<span class="flex-1 truncate">{lesson.title}</span>

							{#if lesson.duration_minutes && accessible}
								<span class="shrink-0 text-[11px] tabular-nums text-charcoal-400">
									{lesson.duration_minutes}m
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</div>
