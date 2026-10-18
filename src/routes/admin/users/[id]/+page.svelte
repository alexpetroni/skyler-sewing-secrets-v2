<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import FormField from '#lib/components/admin/FormField.svelte';
	import { formatDate, formatDateTime } from '#lib/components/admin/format.ts';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import { setAdminPhrase } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const profile = $derived(data.detail.profile);
	const active = $derived(data.detail.entitlements.filter((row) => row.revokedAt === null));

	const sourceLabels = {
		purchase: 'Purchase',
		migration: 'Migrated',
		admin_grant: 'Admin grant',
		gift: 'Gift'
	} as const;
</script>

<AdminPage title={profile.full_name || profile.email} description={profile.email}>
	{#snippet actions()}
		<a href="/admin/users" class="btn-ghost btn-sm">All users</a>
		<a href="/admin/audit?entity=profile&entityId={profile.id}" class="btn-ghost btn-sm">
			Audit log
		</a>
	{/snippet}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<Card class="lg:col-span-2">
			<div class="flex items-center gap-4">
				<Avatar src={profile.avatar_url} name={profile.full_name || profile.email} size="lg" />
				<div class="space-y-1">
					<div class="flex flex-wrap gap-1">
						{#if profile.is_admin}<Badge variant="primary">Admin</Badge>{/if}
						{#if profile.is_member}<Badge variant="success">Member</Badge>{/if}
						{#if profile.is_suspended}<Badge variant="error">Suspended</Badge>{/if}
					</div>
					<p class="text-sm text-gray-500">
						Joined {formatDate(profile.created_at)}
						{#if profile.member_since}· member since {formatDate(profile.member_since)}{/if}
					</p>
					{#if profile.is_suspended}
						<p class="text-sm text-red-700">
							Suspended {formatDate(profile.suspended_at)}: {profile.suspended_reason}
						</p>
					{/if}
				</div>
			</div>
			<dl class="mt-6 grid grid-cols-3 gap-4 text-sm">
				<div>
					<dt class="text-gray-500">Lessons started</dt>
					<dd class="font-semibold text-gray-900">{data.detail.progress.started}</dd>
				</div>
				<div>
					<dt class="text-gray-500">Lessons completed</dt>
					<dd class="font-semibold text-gray-900">{data.detail.progress.completed}</dd>
				</div>
				<div>
					<dt class="text-gray-500">Last activity</dt>
					<dd class="font-semibold text-gray-900">
						{formatDate(data.detail.progress.lastActivityAt)}
					</dd>
				</div>
			</dl>
		</Card>

		<Card>
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Account</h2>
			<div class="space-y-6">
				<Form form={data.forms.sendReset} action="?/sendReset">
					{#snippet children({ submitting })}
						<Button type="submit" variant="secondary" size="sm" loading={submitting}>
							Send password reset
						</Button>
					{/snippet}
				</Form>

				<Form form={data.forms.revokeSessions} action="?/revokeSessions">
					{#snippet children({ submitting })}
						<p class="mb-2 text-sm text-gray-500">
							{data.detail.sessionCount} active {data.detail.sessionCount === 1
								? 'session'
								: 'sessions'}
						</p>
						<Button type="submit" variant="secondary" size="sm" loading={submitting}>
							Sign out everywhere
						</Button>
					{/snippet}
				</Form>

				{#if profile.is_suspended}
					<Form form={data.forms.unsuspend} action="?/unsuspend">
						{#snippet children({ submitting })}
							<Button type="submit" variant="success" size="sm" loading={submitting}>
								Unsuspend
							</Button>
						{/snippet}
					</Form>
				{:else if !profile.is_admin}
					<Form form={data.forms.suspend} action="?/suspend" class="space-y-3">
						{#snippet children({ errors, submitting })}
							<Input name="reason" label="Suspension reason" error={errors.reason?.[0]} />
							<Button type="submit" variant="danger" size="sm" loading={submitting}>Suspend</Button>
						{/snippet}
					</Form>
				{/if}

				<ConfirmForm
					form={data.forms.setAdmin}
					action="?/setAdmin"
					phrase={setAdminPhrase(!profile.is_admin)}
					label={profile.is_admin ? 'Remove admin' : 'Make admin'}
					description={profile.is_admin
						? 'They lose access to this panel immediately.'
						: 'They get full access to this panel, every order and every account.'}
					hidden={{ isAdmin: String(!profile.is_admin) }}
				/>
			</div>
		</Card>
	</div>

	<Card>
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Entitlements</h2>
		{#if data.detail.entitlements.length > 0}
			<ul class="divide-y divide-gray-100">
				{#each data.detail.entitlements as entitlement (entitlement.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
						<div>
							<p class="font-medium text-gray-900">{entitlement.productTitle}</p>
							<p class="text-gray-500">
								{sourceLabels[entitlement.source]} · {formatDate(entitlement.grantedAt)}
								{#if entitlement.grantedBy}· by {entitlement.grantedBy.email}{/if}
							</p>
						</div>
						{#if entitlement.revokedAt}
							<Badge variant="error">
								Revoked {formatDate(entitlement.revokedAt)}: {entitlement.revokeReason}
							</Badge>
						{:else}
							<Badge variant="success">Active</Badge>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-gray-500">Owns nothing yet.</p>
		{/if}

		<div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
			<Form form={data.forms.grant} action="?/grant" class="space-y-3">
				{#snippet children({ errors, submitting })}
					<h3 class="font-semibold text-gray-900">Grant a product</h3>
					<FormField id="grant-product" label="Product" error={errors.productId}>
						<select id="grant-product" name="productId" class="select">
							<option value="">Choose…</option>
							{#each data.detail.products as product (product.id)}
								<option value={product.id}>
									{product.title} ({product.kind}{product.isPublished ? '' : ', draft'})
								</option>
							{/each}
						</select>
					</FormField>
					<Input name="reason" label="Reason" error={errors.reason?.[0]} />
					<Button type="submit" size="sm" loading={submitting}>Grant</Button>
				{/snippet}
			</Form>

			{#if active.length > 0}
				<Form form={data.forms.revoke} action="?/revoke" class="space-y-3">
					{#snippet children({ errors, submitting })}
						<h3 class="font-semibold text-gray-900">Revoke access</h3>
						<FormField id="revoke-product" label="Product" error={errors.productId}>
							<select id="revoke-product" name="productId" class="select">
								{#each active as entitlement (entitlement.id)}
									<option value={entitlement.productId}>{entitlement.productTitle}</option>
								{/each}
							</select>
						</FormField>
						<Input name="reason" label="Reason" error={errors.reason?.[0]} />
						<Button type="submit" variant="danger" size="sm" loading={submitting}>Revoke</Button>
					{/snippet}
				</Form>
			{/if}
		</div>
	</Card>

	<Card>
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Orders</h2>
		{#if data.detail.orders.length > 0}
			<ul class="divide-y divide-gray-100">
				{#each data.detail.orders as order (order.id)}
					<li class="flex items-center justify-between py-3 text-sm">
						<a
							href="/admin/orders/{order.id}"
							class="font-medium text-brand-600 hover:text-brand-500"
						>
							{order.items.map((item) => item.product_title).join(', ')}
						</a>
						<span class="text-gray-500">
							{formatDateTime(order.created_at)} · {order.status} ·
							<span class="font-semibold text-gray-900">{formatPence(order.total)}</span>
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-gray-500">No orders.</p>
		{/if}
	</Card>
</AdminPage>
