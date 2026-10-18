<script lang="ts">
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import Alert from '#lib/components/ui/Alert.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** The QR code, secret and backup codes: shown once, straight after the password step. */
	const setup = $derived(form && 'setup' in form ? form.setup : null);
</script>

<AdminPage
	title="Security"
	description="Two-factor authentication protects every admin account with a code from an authenticator app."
>
	{#if data.required}
		<Alert variant="warning">
			Two-factor authentication is required for admin accounts. Set it up below to use the rest of
			the admin panel.
		</Alert>
	{/if}

	<Card>
		<div class="flex items-center justify-between gap-4">
			<h2 class="text-lg font-semibold text-gray-900">Two-factor authentication</h2>
			{#if data.enabled}
				<Badge variant="success">On</Badge>
			{:else}
				<Badge variant="warning">Off</Badge>
			{/if}
		</div>

		{#if data.enabled}
			<p class="mt-1 text-sm text-gray-500">
				Signing in asks for a code from your authenticator app, or one of your backup codes. To turn
				it off, confirm your password and a current code.
			</p>
			<Form form={data.forms.disable} action="?/disable" class="mt-4 max-w-md space-y-4">
				{#snippet children({ errors, submitting })}
					<Input
						label="Password"
						name="password"
						type="password"
						autocomplete="current-password"
						error={errors.password?.[0]}
					/>
					<Input
						label="Code from your app"
						name="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						error={errors.code?.[0]}
					/>
					<Button type="submit" variant="danger" size="sm" loading={submitting}>
						Turn two-factor authentication off
					</Button>
				{/snippet}
			</Form>
		{:else if setup}
			<p class="mt-1 text-sm text-gray-500">
				Scan the QR code with an authenticator app (1Password, Google Authenticator, Authy…), then
				enter the code it shows to finish.
			</p>
			<div class="mt-4 grid gap-6 md:grid-cols-2">
				<div class="space-y-3">
					<img
						src={setup.qrDataUrl}
						alt="QR code for your authenticator app"
						width="192"
						height="192"
						class="rounded-lg bg-white p-2 ring-1 ring-gray-200"
					/>
					<p class="text-sm text-gray-500">
						Cannot scan? Enter this key by hand:
						<code class="block font-mono text-xs break-all text-gray-900 select-all">
							{setup.secret}
						</code>
					</p>
				</div>
				<div>
					<h3 class="text-sm font-semibold text-gray-900">Backup codes</h3>
					<p class="mt-1 text-sm text-gray-500">
						Each code signs you in once if you lose the app. They are shown only now: store them
						somewhere safe.
					</p>
					<ul class="mt-3 grid grid-cols-2 gap-1 font-mono text-sm text-gray-900">
						{#each setup.backupCodes as code (code)}
							<li class="rounded bg-gray-50 px-2 py-1 select-all">{code}</li>
						{/each}
					</ul>
				</div>
			</div>
			<Form form={data.forms.verify} action="?/verify" class="mt-6 max-w-md space-y-4">
				{#snippet children({ errors, submitting })}
					<Input
						label="Code from your app"
						name="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						error={errors.code?.[0]}
					/>
					<Button type="submit" size="sm" loading={submitting}
						>Turn two-factor authentication on</Button
					>
				{/snippet}
			</Form>
		{:else}
			<p class="mt-1 text-sm text-gray-500">
				Confirm your password to get a QR code for your authenticator app and a set of backup codes.
			</p>
			<Form form={data.forms.enable} action="?/enable" class="mt-4 max-w-md space-y-4">
				{#snippet children({ errors, submitting })}
					<Input
						label="Password"
						name="password"
						type="password"
						autocomplete="current-password"
						error={errors.password?.[0]}
					/>
					<Button type="submit" size="sm" loading={submitting}
						>Set up two-factor authentication</Button
					>
				{/snippet}
			</Form>
		{/if}
	</Card>
</AdminPage>
