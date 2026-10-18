<script lang="ts">
	import Input from '#lib/components/ui/Input.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';

	interface ModuleValues {
		title: string;
		slug: string;
		description: string | null;
		thumbnail_url: string | null;
		order_index: number;
		is_published: boolean;
		is_bonus: boolean;
		is_course_content: boolean;
	}

	interface Props {
		/** The saved module; absent on the new-module form. */
		module?: ModuleValues;
		/** Default position for a new module. */
		orderIndex?: number;
		errors: Record<string, string[] | undefined>;
	}

	let { module, orderIndex = 0, errors }: Props = $props();
</script>

<div class="space-y-6">
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Title"
			name="title"
			value={module?.title ?? ''}
			required
			error={errors.title?.[0]}
		/>
		<Input
			label="Slug"
			name="slug"
			value={module?.slug ?? ''}
			required
			hint="Lowercase letters, numbers and hyphens"
			error={errors.slug?.[0]}
		/>
	</div>

	<Textarea
		label="Description"
		name="description"
		rows={3}
		value={module?.description ?? ''}
		error={errors.description?.[0]}
	/>

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Thumbnail URL"
			name="thumbnailUrl"
			type="url"
			value={module?.thumbnail_url ?? ''}
			error={errors.thumbnailUrl?.[0]}
		/>
		<Input
			label="Order Index"
			name="orderIndex"
			type="number"
			min="0"
			value={String(module?.order_index ?? orderIndex)}
			required
			error={errors.orderIndex?.[0]}
		/>
	</div>

	<div class="flex flex-wrap gap-6">
		{@render checkbox(
			'isPublished',
			'Published',
			'Make this module visible to users',
			module?.is_published ?? false
		)}
		{@render checkbox(
			'isBonus',
			'Bonus Module',
			'Mark as bonus content',
			module?.is_bonus ?? false
		)}
		{@render checkbox(
			'isCourseContent',
			'Course content',
			'Part of the course outline',
			module?.is_course_content ?? true
		)}
	</div>
</div>

{#snippet checkbox(name: string, label: string, description: string, checked: boolean)}
	<label for="module-{name}" class="flex items-start gap-2.5 text-sm">
		<input
			id="module-{name}"
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
