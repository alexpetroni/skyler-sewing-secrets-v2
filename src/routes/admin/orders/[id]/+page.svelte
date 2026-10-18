<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import { formatDateTime } from '#lib/components/admin/format.ts';
	import { statusVariant } from '#lib/components/admin/order-status.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const order = $derived(data.detail.order);
	const links = $derived(data.detail.links);

	const accessLabels = {
		none: { text: 'Not granted', variant: 'gray' },
		granted: { text: 'Access granted', variant: 'success' },
		revoked: { text: 'Access revoked', variant: 'error' }
	} as const;
</script>

<AdminPage title="Order" description={order.id}>
	{#snippet actions()}
		<a href="/admin/orders" class="btn-ghost btn-sm">All orders</a>
	{/snippet}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<Card class="lg:col-span-2">
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<Badge variant={statusVariant[order.status]}>{order.status.replace('_', ' ')}</Badge>
				<a
					href="/admin/users/{data.detail.buyer.id}"
					class="text-sm text-brand-600 hover:text-brand-500"
				>
					{data.detail.buyer.email}
				</a>
			</div>
			<ul class="divide-y divide-gray-100">
				{#each data.detail.items as item (item.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
						<div>
							<p class="font-medium text-gray-900">{item.productTitle}</p>
							<p class="text-gray-500">
								List {formatPence(item.listPrice)}
								{#if item.discount > 0}· discount −{formatPence(item.discount)}{/if}
								{#if item.refunded > 0}· refunded {formatPence(item.refunded)}{/if}
							</p>
						</div>
						<div class="flex items-center gap-3">
							<Badge variant={accessLabels[item.access].variant}>
								{accessLabels[item.access].text}
							</Badge>
							<span class="font-semibold text-gray-900">{formatPence(item.unitPrice)}</span>
						</div>
					</li>
				{/each}
			</ul>
			<dl class="mt-4 space-y-1 border-t border-gray-100 pt-4 text-sm">
				<div class="flex justify-between">
					<dt class="text-gray-500">Subtotal</dt>
					<dd>{formatPence(order.subtotal)}</dd>
				</div>
				{#if order.discount_total > 0}
					<div class="flex justify-between">
						<dt class="text-gray-500">
							Discount{#if data.detail.promoCode}
								(<span class="font-mono">{data.detail.promoCode}</span>){/if}
						</dt>
						<dd>−{formatPence(order.discount_total)}</dd>
					</div>
				{/if}
				<div class="flex justify-between font-semibold text-gray-900">
					<dt>Total</dt>
					<dd>{formatPence(order.total)}</dd>
				</div>
			</dl>
		</Card>

		<Card>
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Timeline</h2>
			<dl class="space-y-2 text-sm">
				<div class="flex justify-between">
					<dt class="text-gray-500">Created</dt>
					<dd>{formatDateTime(order.created_at)}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-gray-500">Paid</dt>
					<dd>{formatDateTime(order.paid_at)}</dd>
				</div>
				{#if order.status === 'pending'}
					<div class="flex justify-between">
						<dt class="text-gray-500">Expires</dt>
						<dd>{formatDateTime(order.expires_at)}</dd>
					</div>
				{/if}
			</dl>

			<h3 class="mt-6 mb-2 font-semibold text-gray-900">Stripe</h3>
			<ul class="space-y-1 text-sm">
				{#if links.session}
					<li>
						<a
							href={links.session}
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand-600 hover:text-brand-500"
						>
							Checkout session
						</a>
					</li>
				{/if}
				{#if links.paymentIntent}
					<li>
						<a
							href={links.paymentIntent}
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand-600 hover:text-brand-500"
						>
							Payment
						</a>
					</li>
				{/if}
				{#if links.customer}
					<li>
						<a
							href={links.customer}
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand-600 hover:text-brand-500"
						>
							Customer
						</a>
					</li>
				{/if}
				{#if !links.session && !links.paymentIntent}
					<li class="text-gray-500">Never reached Stripe.</li>
				{/if}
			</ul>

			<div class="mt-6">
				<Form form={data.forms.rerunFulfilment} action="?/rerunFulfilment">
					{#snippet children({ submitting })}
						<Button type="submit" variant="secondary" size="sm" loading={submitting}>
							Re-run fulfilment
						</Button>
					{/snippet}
				</Form>
			</div>
		</Card>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<Card>
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Webhook events</h2>
			{#if data.detail.events.length > 0}
				<ul class="divide-y divide-gray-100 text-sm">
					{#each data.detail.events as event (event.id)}
						<li class="py-3">
							<div class="flex justify-between">
								<span class="font-mono text-gray-900">{event.type}</span>
								<span class="text-gray-500">{formatDateTime(event.receivedAt)}</span>
							</div>
							{#if event.error}
								<p class="text-red-700">{event.error}</p>
							{:else if !event.processedAt}
								<p class="text-gray-500">Not processed yet</p>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-gray-500">No events received.</p>
			{/if}
		</Card>

		<Card>
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Notes</h2>
			{#if order.admin_notes}
				<p class="mb-4 text-sm whitespace-pre-line text-gray-700">{order.admin_notes}</p>
			{/if}
			<Form form={data.forms.addNote} action="?/addNote" class="space-y-3">
				{#snippet children({ errors, submitting })}
					<Textarea name="note" label="Add a note" rows={3} error={errors.note?.[0]} />
					<Button type="submit" size="sm" loading={submitting}>Save note</Button>
				{/snippet}
			</Form>

			{#if data.detail.audit.length > 0}
				<h3 class="mt-6 mb-2 font-semibold text-gray-900">History</h3>
				<ul class="space-y-1 text-sm text-gray-500">
					{#each data.detail.audit as entry (entry.id)}
						<li>
							{formatDateTime(entry.createdAt)} · {entry.action} · {entry.actor?.email ?? 'system'}
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	</div>
</AdminPage>
