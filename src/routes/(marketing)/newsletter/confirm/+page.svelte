<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { Alert } from '#lib/components/ui/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Confirm Subscription - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageHeader eyebrow="Couture Notes" title="Confirm your subscription" compact />

<section class="container-default pb-24 sm:pb-32">
	<div class="mx-auto max-w-xl">
		{#if data.confirmed}
			<Alert variant="success" title="You're subscribed">
				Thank you for confirming. Couture Notes will arrive in your inbox; every issue has an
				unsubscribe link.
			</Alert>
		{:else}
			<Alert variant="error" title="This link is invalid">
				The confirmation link is invalid or has already been used. You can sign up again from the
				newsletter form on any page.
			</Alert>
		{/if}
		<p class="mt-8">
			<a href="/" class="link">Back to the homepage</a>
		</p>
	</div>
</section>
