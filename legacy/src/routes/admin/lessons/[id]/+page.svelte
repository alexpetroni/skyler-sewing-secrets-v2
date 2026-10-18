<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, Button, Input, Textarea, Toggle, Alert, Select, Modal } from '$lib/components/ui';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let loading = $state(false);
	let showDeleteModal = $state(false);
</script>

<svelte:head>
	<title>Edit {data.lesson.title} - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<a href="/admin/lessons" aria-label="Back to lessons" class="text-gray-400 hover:text-gray-500">
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
				</svg>
			</a>
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Edit Lesson</h1>
				<p class="mt-1 text-sm text-gray-500">{data.lesson.title}</p>
			</div>
		</div>
		<button
			type="button"
			class="text-red-600 hover:text-red-700 text-sm font-medium"
			onclick={() => showDeleteModal = true}
		>
			Delete Lesson
		</button>
	</div>

	{#if form?.success}
		<Alert variant="success">
			{#snippet children()}Lesson updated successfully.{/snippet}
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
					<Select
						label="Module"
						name="module_id"
						required
						value={data.lesson.module_id}
						error={form?.errors?.module_id}
					>
						{#each data.modules as module}
							<option value={module.id}>{module.title}</option>
						{/each}
					</Select>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<Input
								label="Title"
								name="title"
								value={data.lesson.title}
								required
								error={form?.errors?.title}
							/>
						</div>
						<div>
							<Input
								label="Slug"
								name="slug"
								value={data.lesson.slug}
								required
								error={form?.errors?.slug}
							/>
						</div>
					</div>

					<Textarea
						label="Description"
						name="description"
						rows={3}
						value={data.lesson.description || ''}
						error={form?.errors?.description}
					/>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Video URL (Bunny.net)"
							name="video_url"
							value={data.lesson.video_url || ''}
							placeholder="bunny:123456/video-id"
							error={form?.errors?.video_url}
						/>
						<Input
							label="Duration (minutes)"
							name="duration_minutes"
							type="number"
							value={data.lesson.duration_minutes?.toString() || ''}
							error={form?.errors?.duration_minutes}
						/>
					</div>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Thumbnail URL"
							name="thumbnail_url"
							type="url"
							value={data.lesson.thumbnail_url || ''}
							error={form?.errors?.thumbnail_url}
						/>
						<Input
							label="Order Index"
							name="order_index"
							type="number"
							value={String(data.lesson.order_index)}
							required
							error={form?.errors?.order_index}
						/>
					</div>

					<Textarea
						label="Content (HTML)"
						name="content"
						rows={6}
						value={data.lesson.content || ''}
						error={form?.errors?.content}
					/>

					<div class="flex gap-6">
						<Toggle
							label="Published"
							name="is_published"
							checked={data.lesson.is_published}
							description="Make this lesson visible to users"
						/>
						<Toggle
							label="Free Preview"
							name="is_free_preview"
							checked={data.lesson.is_free_preview}
							description="Allow non-members to watch"
						/>
					</div>
				</div>

				<div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
					<a href="/admin/lessons">
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
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Delete Lesson</h3>
				<p class="text-sm text-gray-600 mb-6">
					Are you sure you want to delete <strong>{data.lesson.title}</strong>? 
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
								{loading ? 'Deleting...' : 'Delete Lesson'}
							{/snippet}
						</Button>
					</div>
				</form>
			</div>
		{/snippet}
	</Modal>
{/if}
