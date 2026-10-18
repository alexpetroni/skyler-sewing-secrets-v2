<script lang="ts">
	import Input from '#lib/components/ui/Input.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface PostValues {
		title: string;
		slug: string;
		excerpt: string | null;
		featured_image_url: string | null;
		content: string;
		content_md: string | null;
		content_html: string | null;
	}

	interface Props {
		/** The saved post; absent on the new-post form. */
		post?: PostValues;
		errors: Record<string, string[] | undefined>;
	}

	let { post, errors }: Props = $props();

	// Posts from the old site hold HTML and no Markdown; it is kept until Markdown replaces it.
	const legacy = $derived(post !== undefined && post.content_md === null);
</script>

<div class="space-y-6">
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Title"
			name="title"
			value={post?.title ?? ''}
			required
			error={errors.title?.[0]}
		/>
		<Input
			label="Slug"
			name="slug"
			value={post?.slug ?? ''}
			required
			hint="Lowercase letters, numbers and hyphens"
			error={errors.slug?.[0]}
		/>
	</div>

	<Textarea
		label="Excerpt"
		name="excerpt"
		rows={2}
		value={post?.excerpt ?? ''}
		error={errors.excerpt?.[0]}
	/>

	<Input
		label="Featured Image URL"
		name="featuredImageUrl"
		type="url"
		value={post?.featured_image_url ?? ''}
		error={errors.featuredImageUrl?.[0]}
	/>

	{#if legacy && post}
		<div class="space-y-3">
			<div class="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
				This post was written in HTML on the old site and has no Markdown yet. Its HTML is kept as
				it is when you save the other fields. To convert it to Markdown, rewrite the content below:
				saving Markdown replaces the HTML.
			</div>
			<Textarea
				label="Stored HTML (read-only)"
				name="legacyHtml"
				rows={10}
				readonly
				class="font-mono text-sm"
				value={post.content}
			/>
		</div>
		<MarkdownEditor
			label="Content (Markdown)"
			name="contentMd"
			value=""
			error={errors.contentMd?.[0]}
		/>
	{:else}
		<MarkdownEditor
			label="Content"
			name="contentMd"
			value={post?.content_md ?? ''}
			html={post?.content_html ?? ''}
			error={errors.contentMd?.[0]}
		/>
	{/if}
</div>
