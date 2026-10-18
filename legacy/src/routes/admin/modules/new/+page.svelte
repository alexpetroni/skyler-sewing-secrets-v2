<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Card, Button, Input, Textarea, Toggle, Alert } from '$lib/components/ui';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

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
	<title>New Module - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/admin/modules" aria-label="Back to modules" class="text-gray-400 hover:text-gray-500">
			<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-900">New Module</h1>
			<p class="mt-1 text-sm text-gray-500">Create a new course module.</p>
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
								placeholder="e.g., Module 1: The Basics"
								error={form?.errors?.title}
							/>
						</div>
						<div>
							<Input
								label="Slug"
								name="slug"
								bind:value={slug}
								required
								placeholder="e.g., the-basics"
								error={form?.errors?.slug}
							/>
							<label class="mt-2 flex items-center gap-2">
								<input type="checkbox" bind:checked={autoSlug} class="rounded border-gray-300">
								<span class="text-xs text-gray-500">Auto-generate from title</span>
							</label>
						</div>
					</div>

					<Textarea
						label="Description"
						name="description"
						rows={3}
						placeholder="Brief description of this module..."
						error={form?.errors?.description}
					/>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Thumbnail URL"
							name="thumbnail_url"
							type="url"
							placeholder="https://..."
							error={form?.errors?.thumbnail_url}
						/>
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
							description="Make this module visible to users"
						/>
						<Toggle
							label="Bonus Module"
							name="is_bonus"
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
							{loading ? 'Creating...' : 'Create Module'}
						{/snippet}
					</Button>
				</div>
			{/snippet}
		</Card>
	</form>
</div>
