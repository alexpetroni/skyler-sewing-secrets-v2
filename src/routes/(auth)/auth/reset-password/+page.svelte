<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { Alert, Input } from '#lib/components/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Reset Password - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<AuthShell title="Set your new password">
	{#if form?.success}
		<div class="text-center">
			<Alert variant="success">Your password has been updated successfully.</Alert>
			<a href="/auth/sign-in" class="btn-primary mt-7 w-full">Sign in with your new password</a>
		</div>
	{:else}
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
			<input type="hidden" name="token" value={data.token} />

			<Input
				label="New password"
				name="password"
				type="password"
				autocomplete="new-password"
				required
				hint="At least 8 characters"
				error={form?.errors?.password}
			/>

			<Input
				label="Confirm password"
				name="confirmPassword"
				type="password"
				autocomplete="new-password"
				required
				error={form?.errors?.confirmPassword}
			/>

			<button type="submit" class="btn-primary w-full" disabled={loading}>
				{loading ? 'Updating…' : 'Update password'}
			</button>
		</form>
	{/if}
</AuthShell>
