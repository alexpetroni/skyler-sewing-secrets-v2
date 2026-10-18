<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ActionData } from './$types';
	import { Input, Alert } from '$lib/components/ui';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();
	let urlError = $derived(page.url.searchParams.get('error'));
</script>

<svelte:head>
	<title>Forgot Password - Skyler's Sewing Secrets</title>
	<meta name="description" content="Reset your Skyler's Sewing Secrets password. Enter your email to receive a password reset link." />
	<meta name="keywords" content="password reset, forgot password, sewing course account recovery" />
</svelte:head>

<AuthShell
	title="Reset your password"
	lede="Enter your email address and we'll send you a link to set a new one."
	showLogo
>
	{#snippet children()}
		{#if form?.success}
			<Alert variant="success" title="Check your email">
				We've sent a password reset link to your email address. Please check your inbox.
			</Alert>
		{:else}
			{#if urlError === 'invalid_or_expired_link'}
				<div class="mb-6">
					<Alert variant="error">
						Your reset link has expired or is invalid. Please request a new one.
					</Alert>
				</div>
			{/if}
			{#if form?.error}
				<div class="mb-6">
					<Alert variant="error">{form.error}</Alert>
				</div>
			{/if}

			<form method="POST" use:enhance class="space-y-5">
				<Input
					label="Email address"
					name="email"
					type="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
					error={form?.errors?.email}
				/>

				<button type="submit" class="btn-primary w-full">Send reset link</button>
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		Remember your password?
		<a href="/auth/sign-in" class="link">Sign in</a>
	{/snippet}
</AuthShell>
