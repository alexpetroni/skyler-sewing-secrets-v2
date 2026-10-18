<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, Button, Input, Textarea, Toggle, Alert, Modal } from '$lib/components/ui';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let loading = $state(false);
	let showDeleteModal = $state(false);
</script>

<svelte:head>
	<title>Edit {data.post.title} - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<a href="/admin/blog" aria-label="Back to blog posts" class="text-gray-400 hover:text-gray-500">
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
				</svg>
			</a>
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Edit Post</h1>
				<p class="mt-1 text-sm text-gray-500">{data.post.title}</p>
			</div>
		</div>
		<div class="flex items-center gap-4">
			<a href="/blog/{data.post.slug}" target="_blank" class="text-sm text-brand-600 hover:text-brand-500">
				View Post →
			</a>
			<button
				type="button"
				class="text-red-600 hover:text-red-700 text-sm font-medium"
				onclick={() => showDeleteModal = true}
			>
				Delete
			</button>
		</div>
	</div>

	{#if form?.success}
		<Alert variant="success">
			{#snippet children()}Post updated successfully.{/snippet}
		</Alert>
	{/if}

	{#if form?.error}
		<Alert variant="error">
			{#snippet children()}{form.error}{/snippet}
		</Alert>
	{/if}

	<form
		method="POST"
		action="?/update"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
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
								value={data.post.title}
								required
								error={form?.errors?.title}
							/>
						</div>
						<div>
							<Input
								label="Slug"
								name="slug"
								value={data.post.slug}
								required
								error={form?.errors?.slug}
							/>
						</div>
					</div>

					<Textarea
						label="Excerpt"
						name="excerpt"
						rows={2}
						value={data.post.excerpt || ''}
						error={form?.errors?.excerpt}
					/>

					<Input
						label="Featured Image URL"
						name="featured_image_url"
						type="url"
						value={data.post.featured_image_url || ''}
						error={form?.errors?.featured_image_url}
					/>

					<Textarea
						label="Content (HTML)"
						name="content"
						rows={12}
						required
						value={data.post.content}
						error={form?.errors?.content}
					/>

					<Toggle
						label="Published"
						name="is_published"
						checked={data.post.is_published}
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
							{loading ? 'Saving...' : 'Save Changes'}
						{/snippet}
					</Button>
				</div>
			{/snippet}
		</Card>
	</form>
</div>

<!-- Delete Modal -->
{#if showDeleteModal}
	<Modal open={showDeleteModal} onclose={() => showDeleteModal = false}>
		{#snippet children()}
			<div class="p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Delete Post</h3>
				<p class="text-sm text-gray-600 mb-6">
					Are you sure you want to delete <strong>{data.post.title}</strong>? 
					This action cannot be undone.
				</p>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						loading = true;
						return async ({ result }) => {
							loading = false;
							if (result.type === 'redirect') {
								goto(result.location);
							}
						};
					}}
				>
					<div class="flex justify-end gap-3">
						<Button variant="secondary" onclick={() => showDeleteModal = false}>
							{#snippet children()}Cancel{/snippet}
						</Button>
						<Button type="submit" variant="danger" disabled={loading}>
							{#snippet children()}
								{loading ? 'Deleting...' : 'Delete Post'}
							{/snippet}
						</Button>
					</div>
				</form>
			</div>
		{/snippet}
	</Modal>
{/if}
