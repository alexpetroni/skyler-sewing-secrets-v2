<script lang="ts">
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';
	import MediaPicker from './MediaPicker.svelte';
	import type { PickerAsset } from './types.ts';

	interface LessonValues {
		module_id: string | null;
		title: string;
		slug: string;
		kind: 'video' | 'article';
		media_asset_id: string | null;
		description: string | null;
		content_md: string | null;
		content_html: string | null;
		is_free_preview: boolean;
		is_published: boolean;
		order_index: number;
	}

	interface Props {
		/** The saved lesson; absent on the new-lesson form. */
		lesson?: LessonValues;
		/** The module a new lesson starts in (null = standalone video). */
		moduleId?: string | null;
		modules: Array<{ id: string; title: string }>;
		assets: PickerAsset[];
		errors: Record<string, string[] | undefined>;
	}

	let { lesson, moduleId = null, modules, assets, errors }: Props = $props();
</script>

<div class="space-y-6">
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Title"
			name="title"
			value={lesson?.title ?? ''}
			required
			error={errors.title?.[0]}
		/>
		<Input
			label="Slug"
			name="slug"
			value={lesson?.slug ?? ''}
			required
			hint="Lowercase letters, numbers and hyphens"
			error={errors.slug?.[0]}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
		<Select
			label="Module"
			name="moduleId"
			value={lesson ? (lesson.module_id ?? '') : (moduleId ?? '')}
			error={errors.moduleId?.[0]}
		>
			<option value="">Standalone video</option>
			{#each modules as module (module.id)}
				<option value={module.id}>{module.title}</option>
			{/each}
		</Select>
		<Select label="Kind" name="kind" value={lesson?.kind ?? 'video'} error={errors.kind?.[0]}>
			<option value="video">Video</option>
			<option value="article">Article</option>
		</Select>
		<Input
			label="Order Index"
			name="orderIndex"
			type="number"
			min="0"
			value={String(lesson?.order_index ?? 0)}
			required
			error={errors.orderIndex?.[0]}
		/>
	</div>

	<MediaPicker
		{assets}
		selectedId={lesson?.media_asset_id ?? null}
		error={errors.mediaAssetId?.[0]}
	/>

	<Textarea
		label="Description"
		name="description"
		rows={3}
		value={lesson?.description ?? ''}
		error={errors.description?.[0]}
	/>

	<MarkdownEditor
		label="Content"
		name="contentMd"
		value={lesson?.content_md ?? ''}
		html={lesson?.content_html ?? ''}
		error={errors.contentMd?.[0]}
	/>

	<div class="flex flex-wrap gap-6">
		{@render checkbox(
			'isFreePreview',
			'Free preview',
			'Anyone can watch this lesson',
			lesson?.is_free_preview ?? false
		)}
		{@render checkbox(
			'isPublished',
			'Published',
			'Needs a video that has finished processing',
			lesson?.is_published ?? false
		)}
	</div>
</div>

{#snippet checkbox(name: string, label: string, description: string, checked: boolean)}
	<label for="lesson-{name}" class="flex items-start gap-2.5 text-sm">
		<input
			id="lesson-{name}"
			{name}
			type="checkbox"
			{checked}
			class="mt-0.5 h-4 w-4 rounded-md border-0 text-sage-600 ring-1 ring-charcoal-900/[0.12] ring-inset focus:ring-2 focus:ring-sage-500"
		/>
		<span>
			<span class="font-medium text-charcoal-900">{label}</span>
			<span class="block text-charcoal-500">{description}</span>
		</span>
	</label>
{/snippet}
