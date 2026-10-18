<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { Textarea, Input, Alert, Avatar } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
		form: {
			error?: string;
			content?: string;
			rating?: number;
			authorTitle?: string;
		} | null;
	}

	let { data, form }: Props = $props();

	// Seeded once from the server payload; edits after that belong to the form.
	let rating = $state(untrack(() => form?.rating ?? data.testimonial?.rating ?? 5));
	let content = $state(untrack(() => form?.content ?? data.testimonial?.content ?? ''));
	let authorTitle = $state(untrack(() => form?.authorTitle ?? data.testimonial?.author_title ?? ''));

	const ratingLabels: Record<number, string> = {
		5: 'Excellent',
		4: 'Great',
		3: 'Good',
		2: 'Fair',
		1: 'Poor'
	};

	const characterCount = $derived(content.length);
	const isEditing = $derived(!!data.testimonial && !data.testimonial.is_published);
</script>

<svelte:head>
	<title>{isEditing ? 'Edit Review' : 'Leave a Review'} - Skyler's Sewing Secrets</title>
	<meta name="description" content="Share your experience with Skyler's Sewing Secrets. Your review helps other sewists discover our professional sewing tutorials." />
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="relative isolate overflow-hidden">
	<div class="aurora -top-28 left-[-10%] h-[26rem] w-[26rem] bg-brand-200/30" aria-hidden="true"></div>

	<div class="mx-auto max-w-2xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
		<a
			href="/profile"
			class="group inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-500 transition-colors duration-400 ease-fluid hover:text-charcoal-900"
		>
			<span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-900/[0.05] transition-transform duration-400 ease-spring group-hover:-translate-x-1">
				<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
				</svg>
			</span>
			Back to profile
		</a>

		<h1 class="page-title mt-10">{isEditing ? 'Edit your review' : 'Leave a review'}</h1>
		<p class="section-description mt-4">
			Share your experience with Skyler's Sewing Secrets. Honest feedback helps other sewists decide.
		</p>

		{#if data.testimonial?.is_published}
			<div class="mt-12 shell shadow-ambient" use:reveal>
				<div class="core px-8 py-14 text-center">
					<span class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-sage-700">
						<svg class="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="8" cy="8" r="6.25" />
							<path d="m5.5 8.25 1.75 1.75 3.25-4" />
						</svg>
					</span>
					<h2 class="subsection-heading mt-6">Review published</h2>
					<p class="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-charcoal-600">
						Thank you — your review is live and helping other sewists.
					</p>
					<a href="/profile" class="btn-secondary mt-8">Back to profile</a>
				</div>
			</div>
		{:else}
			<div class="mt-12 shell-lg shadow-float" use:reveal>
				<form method="POST" action="?/submit" use:enhance class="core-lg space-y-7 px-7 py-8 sm:px-9 sm:py-10">
					{#if form?.error}
						<Alert variant="error">{form.error}</Alert>
					{/if}

					<fieldset>
						<legend class="label">Your rating <span class="text-red-600">*</span></legend>
						<div class="flex items-center gap-1">
							{#each [1, 2, 3, 4, 5] as star}
								<button
									type="button"
									onclick={() => (rating = star)}
									aria-label="Rate {star} {star === 1 ? 'star' : 'stars'}"
									aria-pressed={star <= rating}
									class="rounded-full p-1 transition-transform duration-400 ease-spring hover:scale-110 active:scale-95"
								>
									<svg
										class="h-8 w-8 transition-colors duration-400 ease-fluid {star <= rating
											? 'text-gold-400'
											: 'text-charcoal-200 hover:text-gold-200'}"
										fill="currentColor"
										viewBox="0 0 20 20"
										aria-hidden="true"
									>
										<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
									</svg>
								</button>
							{/each}
							<span class="ml-3 text-[13px] text-charcoal-500">{ratingLabels[rating]}</span>
						</div>
						<input type="hidden" name="rating" value={rating} />
					</fieldset>

					<div>
						<Textarea
							id="content"
							name="content"
							label="Your review *"
							rows={5}
							bind:value={content}
							placeholder="Share your experience with the course. What did you learn? How has it helped your sewing?"
						/>
						<p class="mt-2 text-[12px] tabular-nums text-charcoal-400">
							{characterCount}/1000 characters (minimum 20)
						</p>
					</div>

					<Input
						label="Your title (optional)"
						name="author_title"
						bind:value={authorTitle}
						placeholder="e.g. Hobbyist sewist, fashion designer, quilter"
					/>

					<!-- Live preview of how the card will read on the site. -->
					<div class="rounded-2xl bg-ivory-100 p-6">
						<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Preview</p>
						<figure class="mt-5">
							<div class="flex gap-1" aria-hidden="true">
								{#each Array(5) as _, i}
									<svg
										class="h-3.5 w-3.5 {i < rating ? 'text-gold-400' : 'text-charcoal-200'}"
										fill="currentColor"
										viewBox="0 0 20 20"
									>
										<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
									</svg>
								{/each}
							</div>
							<blockquote class="mt-4 font-serif text-[1.125rem] leading-relaxed text-charcoal-800">
								{content || 'Your review will appear here…'}
							</blockquote>
							<figcaption class="mt-5 flex items-center gap-3">
								<Avatar name={data.profile.full_name || 'Member'} size="md" />
								<div class="min-w-0">
									<p class="truncate text-[14px] font-semibold text-charcoal-900">
										{data.profile.full_name || 'Member'}
									</p>
									{#if authorTitle}
										<p class="truncate text-[12px] text-charcoal-500">{authorTitle}</p>
									{/if}
								</div>
							</figcaption>
						</figure>
					</div>

					<div class="flex flex-wrap items-center justify-between gap-4 border-t border-charcoal-900/[0.07] pt-6">
						<p class="text-[13px] text-charcoal-500">Published after moderation.</p>
						<button type="submit" class="btn-primary group">
							{isEditing ? 'Update review' : 'Submit review'}
							<span class="btn-orb" aria-hidden="true">
								<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
								</svg>
							</span>
						</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
</section>
