<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import Seo from '#lib/components/Seo.svelte';
	import { Alert, Input } from '#lib/components/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let loading = $state(false);
</script>

<Seo
	title="Delete account - Skyler's Sewing Secrets"
	description="Delete your Skyler's Sewing Secrets account and the personal data we hold about you."
	noindex
/>

<section class="relative isolate overflow-hidden">
	<div
		class="aurora -top-28 left-[-10%] h-[26rem] w-[26rem] bg-brand-200/30"
		aria-hidden="true"
	></div>

	<div class="container-narrow pt-12 pb-24 sm:pt-16">
		{#if data.done}
			<h1 class="page-title">Your account has been deleted</h1>
			<p class="section-description mt-4">
				Your personal details are gone and your access has ended. Records of your purchases are kept
				for accounting only. Thank you for sewing with us.
			</p>
			<a href="/" class="btn-secondary mt-8">Back to the homepage</a>
		{:else}
			<h1 class="page-title">Delete your account</h1>
			<p class="section-description mt-4">
				This removes your name, email address and picture, signs you out everywhere and ends your
				access to everything you own. It cannot be undone. Your order history is kept for accounting
				without your personal details.
			</p>
			<p class="mt-4 text-[14px] text-charcoal-500">
				Want a copy of your data first?
				<a href="/profile/export" class="link">Download it</a>.
			</p>

			<div class="shell mt-10 shadow-ambient">
				<div class="core p-7 sm:p-9">
					{#if form?.error}
						<div class="mb-6">
							<Alert variant="error">{form.error}</Alert>
						</div>
					{/if}

					<form
						method="POST"
						use:enhance={() => {
							loading = true;
							return async ({ update }) => {
								loading = false;
								await update({ reset: false });
							};
						}}
						class="space-y-5"
					>
						{#if data.hasPassword}
							<Input
								label="Confirm your password"
								name="password"
								type="password"
								autocomplete="current-password"
								required
							/>
						{:else}
							<Input
								label="Type “{data.phrase}” to confirm"
								name="confirm"
								autocomplete="off"
								required
							/>
						{/if}

						<div class="flex flex-wrap items-center gap-4">
							<button type="submit" class="btn-primary" disabled={loading}>
								{loading ? 'Deleting…' : 'Delete my account'}
							</button>
							<a href="/profile" class="link text-[14px]">Keep my account</a>
						</div>
					</form>
				</div>
			</div>
		{/if}
	</div>
</section>
