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
	<title>Edit Testimonial - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<a href="/admin/testimonials" aria-label="Back to testimonials" class="text-gray-400 hover:text-gray-500">
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
				</svg>
			</a>
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Edit Testimonial</h1>
				<p class="mt-1 text-sm text-gray-500">From {data.testimonial.author_name}</p>
			</div>
		</div>
		<button
			type="button"
			class="text-red-600 hover:text-red-700 text-sm font-medium"
			onclick={() => showDeleteModal = true}
		>
			Delete
		</button>
	</div>

	{#if form?.success}
		<Alert variant="success">
			{#snippet children()}Testimonial updated successfully.{/snippet}
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
						<Input
							label="Author Name"
							name="author_name"
							value={data.testimonial.author_name}
							required
							error={form?.errors?.author_name}
						/>
						<Input
							label="Author Title (optional)"
							name="author_title"
							value={data.testimonial.author_title || ''}
							error={form?.errors?.author_title}
						/>
					</div>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Country (optional)"
							name="country"
							value={data.testimonial.country || ''}
							error={form?.errors?.country}
						/>
						<Input
							label="Author Avatar URL (optional)"
							name="author_avatar_url"
							type="url"
							value={data.testimonial.author_avatar_url || ''}
							error={form?.errors?.author_avatar_url}
						/>
					</div>

					<Textarea
						label="Testimonial Content"
						name="content"
						rows={4}
						required
						value={data.testimonial.content}
						error={form?.errors?.content}
					/>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Select
							label="Rating"
							name="rating"
							error={form?.errors?.rating}
							value={String(data.testimonial.rating || 5)}
						>
							<option value="5">5 Stars</option>
							<option value="4">4 Stars</option>
							<option value="3">3 Stars</option>
							<option value="2">2 Stars</option>
							<option value="1">1 Star</option>
						</Select>
						<Input
							label="Order Index"
							name="order_index"
							type="number"
							value={String(data.testimonial.order_index)}
							required
							error={form?.errors?.order_index}
						/>
					</div>

					<div class="flex gap-6">
						<Toggle
							label="Published"
							name="is_published"
							checked={data.testimonial.is_published}
							description="Show on the website"
						/>
						<Toggle
							label="Featured"
							name="is_featured"
							checked={data.testimonial.is_featured}
							description="Show on homepage"
						/>
					</div>
				</div>

				<div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
					<a href="/admin/testimonials">
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
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Delete Testimonial</h3>
				<p class="text-sm text-gray-600 mb-6">
					Are you sure you want to delete this testimonial from <strong>{data.testimonial.author_name}</strong>?
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
								{loading ? 'Deleting...' : 'Delete'}
							{/snippet}
						</Button>
					</div>
				</form>
			</div>
		{/snippet}
	</Modal>
{/if}
