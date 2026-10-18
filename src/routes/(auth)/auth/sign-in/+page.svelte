<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import OAuthButtons from '#lib/components/auth/OAuthButtons.svelte';
	import { Alert, Input } from '#lib/components/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Sign In - Skyler's Sewing Secrets</title>
	<meta
		name="description"
		content="Sign in to access your Skyler's Sewing Secrets account and continue learning professional sewing techniques."
	/>
	<meta
		name="keywords"
		content="sewing course login, member sign in, Skyler's Sewing Secrets account"
	/>
</svelte:head>

<AuthShell title="Welcome back" lede="Sign in to pick up where you left off.">
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

		<Input
			label="Email address"
			name="email"
			type="email"
			autocomplete="email"
			required
			value={form?.email ?? ''}
			error={form?.errors?.email}
		/>

		<Input
			label="Password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
			error={form?.errors?.password}
		/>

		<div class="flex items-center justify-between gap-4">
			<label for="remember-me" class="flex items-center gap-2.5 text-[13px] text-charcoal-600">
				<input
					id="remember-me"
					name="remember-me"
					type="checkbox"
					class="h-4 w-4 rounded-md border-0 text-sage-600 ring-1 ring-charcoal-900/[0.12] ring-inset focus:ring-2 focus:ring-sage-500"
				/>
				Remember me
			</label>

			<a
				href="/auth/forgot-password"
				class="text-[13px] font-medium text-charcoal-500 transition-colors duration-400 ease-fluid hover:text-charcoal-900"
			>
				Forgot password?
			</a>
		</div>

		<button type="submit" class="btn-primary w-full" disabled={loading}>
			{loading ? 'Signing in…' : 'Sign in'}
		</button>
	</form>

	{#if data.googleEnabled}
		<div class="relative mt-9">
			<div class="absolute inset-0 flex items-center" aria-hidden="true">
				<div class="w-full border-t border-charcoal-900/[0.08]"></div>
			</div>
			<div class="relative flex justify-center">
				<span class="bg-white px-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
					Or continue with
				</span>
			</div>
		</div>

		<OAuthButtons redirectTo={data.redirectTo} action="sign-in" />
	{/if}

	{#snippet footer()}
		Not a member yet?
		<a href="/catalogue" class="link">Enrol for lifetime access</a>
	{/snippet}
</AuthShell>
