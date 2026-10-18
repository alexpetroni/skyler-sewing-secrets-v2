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
	<title>New Lesson - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/admin/lessons" aria-label="Back to lessons" class="text-gray-400 hover:text-gray-500">
			<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-900">New Lesson</h1>
			<p class="mt-1 text-sm text-gray-500">Create a new course lesson.</p>
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
					<Select
						label="Module"
						name="module_id"
						required
						value={data.preselectedModule || ''}
						error={form?.errors?.module_id}
					>
						<option value="">Select a module...</option>
						{#each data.modules as module}
							<option value={module.id}>{module.title}</option>
						{/each}
					</Select>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div>
							<Input
								label="Title"
								name="title"
								bind:value={title}
								required
								placeholder="e.g., Introduction to Seams"
								error={form?.errors?.title}
							/>
						</div>
						<div>
							<Input
								label="Slug"
								name="slug"
								bind:value={slug}
								required
								placeholder="e.g., introduction-to-seams"
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
						placeholder="Brief description of this lesson..."
						error={form?.errors?.description}
					/>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Video URL (Bunny.net)"
							name="video_url"
							placeholder="bunny:123456/video-id"
							error={form?.errors?.video_url}
						/>
						<Input
							label="Duration (minutes)"
							name="duration_minutes"
							type="number"
							placeholder="15"
							error={form?.errors?.duration_minutes}
						/>
					</div>

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
							value="1"
							required
							error={form?.errors?.order_index}
						/>
					</div>

					<Textarea
						label="Content (HTML)"
						name="content"
						rows={6}
						placeholder="Additional lesson content..."
						error={form?.errors?.content}
					/>

					<div class="flex gap-6">
						<Toggle
							label="Published"
							name="is_published"
							description="Make this lesson visible to users"
						/>
						<Toggle
							label="Free Preview"
							name="is_free_preview"
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
							{loading ? 'Creating...' : 'Create Lesson'}
						{/snippet}
					</Button>
				</div>
			{/snippet}
		</Card>
	</form>
</div>
