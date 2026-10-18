<script lang="ts">
	import Input from '#lib/components/ui/Input.svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface FaqValues {
		question: string;
		answer: string;
		answer_md: string | null;
		answer_html: string | null;
		category: string | null;
		order_index: number;
		is_published: boolean;
	}

	interface Props {
		/** The saved item; absent on the new-question form. */
		faq?: FaqValues;
		/** Default position for a new question. */
		orderIndex?: number;
		errors: Record<string, string[] | undefined>;
	}

	let { faq, orderIndex = 0, errors }: Props = $props();
</script>

<div class="space-y-6">
	<Input
		label="Question"
		name="question"
		value={faq?.question ?? ''}
		required
		error={errors.question?.[0]}
	/>

	<!-- Legacy answers have no Markdown; their stored text is the starting point. -->
	<MarkdownEditor
		label="Answer"
		name="answerMd"
		rows={8}
		value={faq ? (faq.answer_md ?? faq.answer) : ''}
		html={faq?.answer_html ?? ''}
		error={errors.answerMd?.[0]}
	/>

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Category"
			name="category"
			value={faq?.category ?? ''}
			hint="Questions are grouped by category; leave empty for General"
			error={errors.category?.[0]}
		/>
		<Input
			label="Order Index"
			name="orderIndex"
			type="number"
			min="0"
			value={String(faq?.order_index ?? orderIndex)}
			required
			error={errors.orderIndex?.[0]}
		/>
	</div>

	<label for="faq-isPublished" class="flex items-start gap-2.5 text-sm">
		<input
			id="faq-isPublished"
			name="isPublished"
			type="checkbox"
			checked={faq?.is_published ?? true}
			class="mt-0.5 h-4 w-4 rounded-md border-0 text-sage-600 ring-1 ring-charcoal-900/[0.12] ring-inset focus:ring-2 focus:ring-sage-500"
		/>
		<span>
			<span class="font-medium text-charcoal-900">Published</span>
			<span class="block text-charcoal-500">Show this question on the FAQ page</span>
		</span>
	</label>
</div>
