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
</script>

<svelte:head>
	<title>New FAQ - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/admin/faq" aria-label="Back to FAQs" class="text-gray-400 hover:text-gray-500">
			<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold text-gray-900">New FAQ</h1>
			<p class="mt-1 text-sm text-gray-500">Add a new frequently asked question.</p>
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
					<Input
						label="Question"
						name="question"
						required
						placeholder="How long do I have access to the course?"
						error={form?.errors?.question}
					/>

					<Textarea
						label="Answer"
						name="answer"
						rows={4}
						required
						placeholder="You get lifetime access..."
						error={form?.errors?.answer}
					/>

					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Category (optional)"
							name="category"
							placeholder="General"
							error={form?.errors?.category}
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

					<Toggle
						label="Published"
						name="is_published"
						description="Show on the FAQ page"
					/>
				</div>

				<div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
					<a href="/admin/faq">
						<Button variant="secondary">
							{#snippet children()}Cancel{/snippet}
						</Button>
					</a>
					<Button type="submit" disabled={loading}>
						{#snippet children()}
							{loading ? 'Creating...' : 'Create FAQ'}
						{/snippet}
					</Button>
				</div>
			{/snippet}
		</Card>
	</form>
</div>
