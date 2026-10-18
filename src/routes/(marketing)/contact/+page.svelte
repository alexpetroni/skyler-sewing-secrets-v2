<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { Alert, Input, Textarea } from '#lib/components/ui/index.ts';
	import { HONEYPOT_FIELD } from '#lib/shared/schemas/marketing.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let errors = $derived(form && 'errors' in form ? form.errors : undefined);
	let values = $derived(form && 'values' in form ? form.values : undefined);
</script>

<svelte:head>
	<title>Contact - Skyler's Sewing Secrets</title>
	<meta
		name="description"
		content="Get in touch with Skyler. We'd love to hear from you about the course, collaborations, or any questions you may have."
	/>
</svelte:head>

<PageHeader
	eyebrow="Contact"
	title="Get in touch"
	lede="Questions about the course, collaborations, or anything else: send a message and I'll get back to you."
/>

<section class="container-default pb-24 sm:pb-32">
	<div class="mx-auto max-w-xl">
		{#if form?.success}
			<Alert variant="success" title="Message sent">
				Thank you for reaching out. I'll get back to you as soon as I can.
			</Alert>
		{:else}
			{#if form && 'error' in form}
				<div class="mb-6">
					<Alert variant="error">{form.error}</Alert>
				</div>
			{/if}

			<form method="POST" use:enhance class="space-y-5">
				<Input
					label="Name"
					name="name"
					autocomplete="name"
					required
					value={values?.name ?? ''}
					error={errors?.name}
				/>
				<Input
					label="Email address"
					name="email"
					type="email"
					autocomplete="email"
					required
					value={values?.email ?? ''}
					error={errors?.email}
				/>
				<Input
					label="Subject"
					name="subject"
					value={values?.subject ?? ''}
					error={errors?.subject}
				/>
				<Textarea
					label="Message"
					name="message"
					rows={6}
					required
					value={values?.message ?? ''}
					error={errors?.message}
				/>
				<!-- Honeypot: hidden from people and assistive tech; bots fill it in. -->
				<div class="sr-only" aria-hidden="true">
					<label for="contact-{HONEYPOT_FIELD}">Website</label>
					<input
						id="contact-{HONEYPOT_FIELD}"
						name={HONEYPOT_FIELD}
						tabindex="-1"
						autocomplete="off"
					/>
				</div>
				<button type="submit" class="btn-primary">Send message</button>
			</form>
		{/if}
	</div>
</section>
