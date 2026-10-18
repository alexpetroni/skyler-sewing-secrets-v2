<script lang="ts">
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';

	interface TestimonialValues {
		author_name: string;
		author_title: string | null;
		country: string | null;
		content: string;
		rating: number | null;
		order_index: number;
		is_featured: boolean;
	}

	interface Props {
		/** The saved testimonial; absent on the new-testimonial form. */
		testimonial?: TestimonialValues;
		errors: Record<string, string[] | undefined>;
	}

	let { testimonial, errors }: Props = $props();

	const ratings = [5, 4, 3, 2, 1];
</script>

<div class="space-y-6">
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Author Name"
			name="authorName"
			value={testimonial?.author_name ?? ''}
			required
			error={errors.authorName?.[0]}
		/>
		<Input
			label="Author Title (optional)"
			name="authorTitle"
			value={testimonial?.author_title ?? ''}
			error={errors.authorTitle?.[0]}
		/>
	</div>

	<Input
		label="Country (optional)"
		name="country"
		value={testimonial?.country ?? ''}
		error={errors.country?.[0]}
	/>

	<Textarea
		label="Testimonial Content"
		name="content"
		rows={5}
		value={testimonial?.content ?? ''}
		required
		error={errors.content?.[0]}
	/>

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Select
			label="Rating"
			name="rating"
			value={String(testimonial?.rating ?? 5)}
			error={errors.rating?.[0]}
		>
			{#each ratings as rating (rating)}
				<option value={String(rating)}>{rating} {rating === 1 ? 'Star' : 'Stars'}</option>
			{/each}
		</Select>
		<Input
			label="Order Index"
			name="orderIndex"
			type="number"
			min="0"
			value={String(testimonial?.order_index ?? 0)}
			required
			error={errors.orderIndex?.[0]}
		/>
	</div>

	<label for="testimonial-isFeatured" class="flex items-start gap-2.5 text-sm">
		<input
			id="testimonial-isFeatured"
			name="isFeatured"
			type="checkbox"
			checked={testimonial?.is_featured ?? false}
			class="mt-0.5 h-4 w-4 rounded-md border-0 text-sage-600 ring-1 ring-charcoal-900/[0.12] ring-inset focus:ring-2 focus:ring-sage-500"
		/>
		<span>
			<span class="font-medium text-charcoal-900">Featured</span>
			<span class="block text-charcoal-500">Show on homepage</span>
		</span>
	</label>
</div>
