<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, Button, Input, Textarea, Toggle, Alert, Badge, Modal } from '$lib/components/ui';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let loading = $state(false);
	let showDeleteModal = $state(false);
</script>

<svelte:head>
	<title>Edit {data.module.title} - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<a href="/admin/modules" aria-label="Back to modules" class="text-gray-400 hover:text-gray-500">
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
				</svg>
			</a>
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Edit Module</h1>
				<p class="mt-1 text-sm text-gray-500">{data.module.title}</p>
			</div>
		</div>
		<button
			type="button"
			class="text-red-600 hover:text-red-700 text-sm font-medium"
			onclick={() => showDeleteModal = true}
		>
			Delete Module
		</button>
	</div>

	{#if form?.success}
		<Alert variant="success">
			{#snippet children()}Module updated successfully.{/snippet}
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
								value={data.module.title}
								required
								error={form?.errors?.title}
							/>
						</div>
						<div>
							<Input
								label="Slug"
								name="slug"
								value={data.module.slug}
								required
								error={form?.errors?.slug}
							/>
						</div>
					</div>

					<Textarea
						label="Description"
						name="description"
						rows={3}
						value={data.module.description || ''}
						error={form?.errors?.description}
					/>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Thumbnail URL"
							name="thumbnail_url"
							type="url"
							value={data.module.thumbnail_url || ''}
							error={form?.errors?.thumbnail_url}
						/>
						<Input
							label="Order Index"
							name="order_index"
							type="number"
							value={String(data.module.order_index)}
							required
							error={form?.errors?.order_index}
						/>
					</div>

					<div class="flex gap-6">
						<Toggle
							label="Published"
							name="is_published"
							checked={data.module.is_published}
							description="Make this module visible to users"
						/>
						<Toggle
							label="Bonus Module"
							name="is_bonus"
							checked={data.module.is_bonus}
							description="Mark as bonus content"
						/>
					</div>
				</div>

				<div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
					<a href="/admin/modules">
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

	<!-- Lessons in this module -->
	<Card>
		{#snippet children()}
			<div class="p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-gray-900">Lessons in this Module</h2>
					<a href="/admin/lessons/new?module={data.module.id}">
						<Button size="sm">
							{#snippet children()}Add Lesson{/snippet}
						</Button>
					</a>
				</div>

				{#if data.module.lessons && data.module.lessons.length > 0}
					<ul class="divide-y divide-gray-100">
						{#each data.module.lessons as lesson, index}
							<li class="py-3 flex items-center justify-between">
								<div class="flex items-center gap-3">
									<span class="text-sm text-gray-400 w-6">{index + 1}.</span>
									<div>
										<p class="text-sm font-medium text-gray-900">{lesson.title}</p>
										<div class="flex gap-2 mt-1">
											{#if lesson.is_published}
												<Badge variant="success" size="sm">
													{#snippet children()}Published{/snippet}
												</Badge>
											{:else}
												<Badge variant="secondary" size="sm">
													{#snippet children()}Draft{/snippet}
												</Badge>
											{/if}
											{#if lesson.is_free_preview}
												<Badge variant="primary" size="sm">
													{#snippet children()}Free Preview{/snippet}
												</Badge>
											{/if}
										</div>
									</div>
								</div>
								<a href="/admin/lessons/{lesson.id}" class="text-sm text-brand-600 hover:text-brand-500">
									Edit
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500 text-center py-4">
						No lessons in this module yet.
					</p>
				{/if}
			</div>
		{/snippet}
	</Card>
</div>

<!-- Delete Modal -->
{#if showDeleteModal}
	<Modal open={showDeleteModal} onclose={() => showDeleteModal = false}>
		{#snippet children()}
			<div class="p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Delete Module</h3>
				<p class="text-sm text-gray-600 mb-6">
					Are you sure you want to delete <strong>{data.module.title}</strong>? 
					This will also delete all lessons in this module. This action cannot be undone.
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
								{loading ? 'Deleting...' : 'Delete Module'}
							{/snippet}
						</Button>
					</div>
				</form>
			</div>
		{/snippet}
	</Modal>
{/if}
