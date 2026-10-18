<script lang="ts">
	import { untrack } from 'svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { formatDuration } from './media-status.ts';
	import type { PickerLesson } from './types.ts';

	interface Props {
		/** The saved items, in order. */
		lessons: PickerLesson[];
		/** The hidden field carrying the ordered ids as JSON. */
		name?: string;
		/** The product being edited, left out of the “already in” hints. */
		productId?: string;
		/** A single holds one item: adding replaces it. */
		max?: number;
		/** The course has no item list. */
		disabled?: boolean;
		error?: string;
		/** `GET ?q=` → `{ lessons: PickerLesson[] }`, at most 20. */
		searchUrl?: string;
	}

	let {
		lessons,
		name = 'lessonIds',
		productId,
		max,
		disabled = false,
		error,
		searchUrl = '/admin/api/lessons'
	}: Props = $props();

	let items = $state<PickerLesson[]>(untrack(() => [...lessons]));
	let query = $state('');
	let results = $state<PickerLesson[]>([]);
	let searched = $state(false);
	let searchError = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	const ids = $derived(JSON.stringify(items.map((item) => item.id)));
	const minutes = $derived(
		Math.round(items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0) / 60)
	);

	async function search() {
		searchError = '';
		try {
			const response = await fetch(`${searchUrl}?${new URLSearchParams({ q: query.trim() })}`);
			if (!response.ok) throw new Error(String(response.status));
			results = ((await response.json()) as { lessons: PickerLesson[] }).lessons;
		} catch {
			searchError = 'Search failed. Try again.';
		}
		searched = true;
	}

	function onSearchInput() {
		clearTimeout(timer);
		timer = setTimeout(search, 250);
	}

	function otherProducts(lesson: PickerLesson) {
		return lesson.products.filter((product) => product.id !== productId);
	}

	function add(lesson: PickerLesson) {
		if (items.some((item) => item.id === lesson.id)) return;
		items = max === 1 ? [lesson] : [...items, lesson];
	}

	function remove(index: number) {
		items = items.filter((_, i) => i !== index);
	}

	function move(index: number, offset: -1 | 1) {
		const target = index + offset;
		if (target < 0 || target >= items.length) return;
		const next = [...items];
		[next[index], next[target]] = [next[target], next[index]];
		items = next;
	}
</script>

{#snippet details(lesson: PickerLesson)}
	<p class="truncate text-sm font-medium text-gray-900">{lesson.title}</p>
	<p class="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
		{#if lesson.moduleTitle}
			<span>{lesson.moduleTitle}</span>
		{:else}
			<Badge size="sm" variant="purple">Standalone</Badge>
		{/if}
		<span>{formatDuration(lesson.durationSeconds)}</span>
		{#if !lesson.isPublished}
			<Badge size="sm" variant="yellow">Draft</Badge>
		{/if}
	</p>
	{#if otherProducts(lesson).length > 0}
		<p class="mt-0.5 text-[13px] text-gray-500">
			Also in: {otherProducts(lesson)
				.map((product) => product.title)
				.join(', ')}
		</p>
	{/if}
{/snippet}

{#if disabled}
	<p class="text-sm text-gray-500">
		The course grants every lesson, present and future. It has no item list to edit.
	</p>
{:else}
	<div class="space-y-4">
		<input type="hidden" {name} value={ids} />

		<div>
			<p class="label">
				Included videos
				<span class="font-normal text-gray-500">
					· {items.length} video{items.length === 1 ? '' : 's'}, {minutes} min
				</span>
			</p>
			<ol
				class="divide-y divide-gray-100 rounded-xl ring-1 {error
					? 'ring-red-300'
					: 'ring-charcoal-900/[0.08]'}"
				data-testid="picked-lessons"
			>
				{#each items as lesson, index (lesson.id)}
					<li class="flex items-center gap-3 px-4 py-3">
						<span class="w-6 text-sm text-gray-400">{index + 1}.</span>
						<div class="min-w-0 flex-1">{@render details(lesson)}</div>
						<div class="flex gap-1">
							<Button
								size="sm"
								variant="ghost"
								disabled={index === 0}
								aria-label="Move {lesson.title} up"
								onclick={() => move(index, -1)}>↑</Button
							>
							<Button
								size="sm"
								variant="ghost"
								disabled={index === items.length - 1}
								aria-label="Move {lesson.title} down"
								onclick={() => move(index, 1)}>↓</Button
							>
							<Button size="sm" variant="ghost" onclick={() => remove(index)}>Remove</Button>
						</div>
					</li>
				{:else}
					<li class="px-4 py-6 text-center text-sm text-gray-500">No videos yet.</li>
				{/each}
			</ol>
			{#if error}
				<p class="mt-2 text-[13px] text-red-700">{error}</p>
			{/if}
		</div>

		<div>
			<label for="{name}-search" class="label">Add a video</label>
			<input
				id="{name}-search"
				type="search"
				class="input"
				placeholder="Search lessons by title or module..."
				autocomplete="off"
				bind:value={query}
				oninput={onSearchInput}
				onfocus={() => {
					if (!searched) search();
				}}
			/>
			{#if searchError}
				<p class="mt-2 text-[13px] text-red-700">{searchError}</p>
			{/if}
			{#if results.length > 0}
				<ul
					class="mt-2 max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-xl ring-1 ring-charcoal-900/[0.08]"
				>
					{#each results as lesson (lesson.id)}
						{@const picked = items.some((item) => item.id === lesson.id)}
						<li class="flex items-center gap-3 px-4 py-3">
							<div class="min-w-0 flex-1">{@render details(lesson)}</div>
							<Button size="sm" variant="secondary" disabled={picked} onclick={() => add(lesson)}>
								{picked ? 'Added' : max === 1 ? 'Choose' : 'Add'}
							</Button>
						</li>
					{/each}
				</ul>
			{:else if searched && !searchError}
				<p class="mt-2 text-sm text-gray-500">No lessons match.</p>
			{/if}
		</div>
	</div>
{/if}
