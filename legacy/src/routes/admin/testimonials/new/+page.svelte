<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, Button, Input, Textarea, Toggle, Alert, Select } from '$lib/components/ui';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let loading = $state(false);
</script>

<svelte:head>
	<title>New Testimonial - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/admin/testimonials" aria-label="Back to testimonials" class="text-gray-400 hover:text-gray-500">
			<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-900">New Testimonial</h1>
			<p class="mt-1 text-sm text-gray-500">Add a new student testimonial.</p>
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
						<Input
							label="Author Name"
							name="author_name"
							required
							placeholder="Jane Smith"
							error={form?.errors?.author_name}
						/>
						<Input
							label="Author Title (optional)"
							name="author_title"
							placeholder="Hobbyist Sewist"
							error={form?.errors?.author_title}
						/>
					</div>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Country (optional)"
							name="country"
							placeholder="UK"
							error={form?.errors?.country}
						/>
						<Input
							label="Author Avatar URL (optional)"
							name="author_avatar_url"
							type="url"
							placeholder="https://..."
							error={form?.errors?.author_avatar_url}
						/>
					</div>

					<Textarea
						label="Testimonial Content"
						name="content"
						rows={4}
						required
						placeholder="Write the testimonial here..."
						error={form?.errors?.content}
					/>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Select
							label="Rating"
							name="rating"
							error={form?.errors?.rating}
							value="5"
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
							value={String(data.nextOrderIndex)}
							required
							error={form?.errors?.order_index}
						/>
					</div>

					<div class="flex gap-6">
						<Toggle
							label="Published"
							name="is_published"
							description="Show on the website"
						/>
						<Toggle
							label="Featured"
							name="is_featured"
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
							{loading ? 'Creating...' : 'Create Testimonial'}
						{/snippet}
					</Button>
				</div>
			{/snippet}
		</Card>
	</form>
</div>
