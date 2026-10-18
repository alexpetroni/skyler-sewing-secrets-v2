<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, Button, Input, Textarea, Toggle, Alert } from '$lib/components/ui';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();

	let loading = $state(false);

	function generateSlug(title: string): string {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	let title = $state('');
	let slug = $state('');
	let autoSlug = $state(true);

	$effect(() => {
		if (autoSlug && title) {
			slug = generateSlug(title);
		}
	});
</script>

<svelte:head>
	<title>New Blog Post - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/admin/blog" aria-label="Back to blog posts" class="text-gray-400 hover:text-gray-500">
			<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-900">New Blog Post</h1>
			<p class="mt-1 text-sm text-gray-500">Create a new blog post.</p>
		</div>
	</div>

	{#if form?.error}
		<Alert variant="error">
			{#snippet children()}{form.error}{/snippet}
		</Alert>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ result, update }) => {
				loading = false;
				if (result.type === 'redirect') {
					goto(result.location);
				} else {
					await update();
				}
			};
		}}
	>
		<Card>
			{#snippet children()}
				<div class="p-6 space-y-6">
					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<Input
								label="Title"
								name="title"
								bind:value={title}
								required
								placeholder="My Awesome Post"
								error={form?.errors?.title}
							/>
						</div>
						<div>
							<Input
								label="Slug"
								name="slug"
								bind:value={slug}
								required
								placeholder="my-awesome-post"
								error={form?.errors?.slug}
							/>
							<label class="mt-2 flex items-center gap-2">
								<input type="checkbox" bind:checked={autoSlug} class="rounded border-gray-300">
								<span class="text-xs text-gray-500">Auto-generate from title</span>
							</label>
						</div>
					</div>

					<Textarea
						label="Excerpt"
						name="excerpt"
						rows={2}
						placeholder="Brief summary of the post..."
						error={form?.errors?.excerpt}
					/>

					<Input
						label="Featured Image URL"
						name="featured_image_url"
						type="url"
						placeholder="https://..."
						error={form?.errors?.featured_image_url}
					/>

					<Textarea
						label="Content (HTML)"
						name="content"
						rows={12}
						required
						placeholder="Write your blog post content here..."
						error={form?.errors?.content}
					/>

					<Toggle
						label="Published"
						name="is_published"
						description="Make this post visible on the blog"
					/>
				</div>

				<div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
					<a href="/admin/blog">
						<Button variant="secondary">
							{#snippet children()}Cancel{/snippet}
						</Button>
					</a>
					<Button type="submit" disabled={loading}>
						{#snippet children()}
							{loading ? 'Creating...' : 'Create Post'}
						{/snippet}
					</Button>
				</div>
			{/snippet}
		</Card>
	</form>
</div>
