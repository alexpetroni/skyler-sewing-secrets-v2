<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { Alert, Input, Select, Textarea } from '#lib/components/ui/index.ts';
	import { REVIEW_MAX } from '#lib/shared/schemas/marketing.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let published = $derived(data.testimonial?.is_published ?? false);
	let values = $derived({
		content: form?.values.content ?? data.testimonial?.content ?? '',
		rating: form?.values.rating ?? String(data.testimonial?.rating ?? 5),
		authorTitle: form?.values.authorTitle ?? data.testimonial?.author_title ?? ''
	});
</script>

<svelte:head>
	<title>Leave a Review - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageHeader
	eyebrow="Your review"
	title="Share your experience"
	lede="Your review helps other sewists discover the course. It appears on the site once it has been approved."
/>

<section class="container-default pb-24 sm:pb-32">
	<div class="mx-auto max-w-xl">
		{#if published}
			<Alert variant="success" title="Thank you">
				Your review has been published and can no longer be edited.
			</Alert>
		{:else}
			{#if form?.error}
				<div class="mb-6">
					<Alert variant="error">{form.error}</Alert>
				</div>
			{/if}

			<form method="POST" action="?/submit" use:enhance class="space-y-5">
				<Select label="Your rating" name="rating" required value={values.rating}>
					{#each [5, 4, 3, 2, 1] as star (star)}
						<option value={String(star)}>{star} {star === 1 ? 'star' : 'stars'}</option>
					{/each}
				</Select>
				<Textarea
					label="Your review"
					name="content"
					rows={6}
					required
					maxlength={REVIEW_MAX}
					value={values.content}
				/>
				<Input
					label="Your title (optional)"
					name="author_title"
					hint="For example: Home sewist, Fashion student"
					value={values.authorTitle}
				/>
				<button type="submit" class="btn-primary">
					{data.testimonial ? 'Update review' : 'Submit review'}
				</button>
			</form>
		{/if}
	</div>
</section>
