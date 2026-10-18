<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import { Alert, Input } from '#lib/components/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let loading = $state(false);
	// The chosen method survives a failed submission through the hidden field.
	let method = $state<'totp' | 'backup'>('totp');
	$effect(() => {
		if (form?.method === 'backup' || form?.method === 'totp') method = form.method;
	});
</script>

<svelte:head>
	<title>Two-factor authentication - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<AuthShell
	title="One more step"
	lede={method === 'backup'
		? 'Enter one of your backup codes.'
		: 'Enter the code from your authenticator app.'}
>
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
		<input type="hidden" name="redirectTo" value={data.redirectTo} />
		<input type="hidden" name="method" value={method} />

		<Input
			label={method === 'backup' ? 'Backup code' : 'Authentication code'}
			name="code"
			inputmode={method === 'backup' ? 'text' : 'numeric'}
			autocomplete="one-time-code"
			required
			error={form?.errors?.code}
		/>

		<button type="submit" class="btn-primary w-full" disabled={loading}>
			{loading ? 'Checking…' : 'Continue'}
		</button>

		<p class="text-center text-[13px] text-charcoal-500">
			{#if method === 'backup'}
				<button type="button" class="link" onclick={() => (method = 'totp')}>
					Use my authenticator app instead
				</button>
			{:else}
				<button type="button" class="link" onclick={() => (method = 'backup')}>
					Lost your device? Use a backup code
				</button>
			{/if}
		</p>
	</form>

	{#snippet footer()}
		<a href="/auth/sign-in" class="link">Back to sign in</a>
	{/snippet}
</AuthShell>
