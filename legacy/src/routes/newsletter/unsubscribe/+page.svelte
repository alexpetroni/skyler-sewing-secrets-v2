<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { Alert } from '$lib/components/ui';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

<svelte:head>
	<title>Unsubscribe - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageHeader
	eyebrow="Couture Notes"
	title="Unsubscribe"
	lede="Stop receiving the Couture Notes newsletter. You can subscribe again at any time from the site."
/>

<section class="container-default pb-24 sm:pb-32">
	<div class="mx-auto max-w-xl">
		{#if form?.success}
			<Alert variant="success" title="You're unsubscribed">
				{data.email} will no longer receive Couture Notes.
			</Alert>
		{:else}
			{#if form?.error}
				<div class="mb-6">
					<Alert variant="error">{form.error}</Alert>
				</div>
			{/if}

			<form method="POST" use:enhance class="space-y-5">
				<input type="hidden" name="email" value={data.email} />
				<input type="hidden" name="token" value={data.token} />
				<p class="text-[15px] leading-relaxed text-charcoal-600">
					Unsubscribe <strong class="text-charcoal-900">{data.email}</strong> from Couture Notes?
				</p>
				<button type="submit" class="btn-primary">Confirm unsubscribe</button>
			</form>
		{/if}
	</div>
</section>
