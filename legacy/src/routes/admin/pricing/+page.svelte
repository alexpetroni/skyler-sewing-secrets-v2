<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Card, Button, Input, Badge, Alert, Modal, Toggle } from '$lib/components/ui';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let loading = $state(false);
	let showPromoModal = $state(false);

	function formatCurrency(amountInPence: number): string {
		return new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency: 'GBP'
		}).format(amountInPence / 100);
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Pricing - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">Pricing</h1>
		<p class="mt-1 text-sm text-gray-500">Manage course pricing and promo codes.</p>
	</div>

	{#if form?.success}
		<Alert variant="success">
			{#snippet children()}{form.message || 'Changes saved successfully.'}{/snippet}
		</Alert>
	{/if}

	{#if form?.error}
		<Alert variant="error">
			{#snippet children()}{form.error}{/snippet}
		</Alert>
	{/if}

	<!-- Current Pricing -->
	<Card>
		{#snippet children()}
			<div class="p-6">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Course Price</h2>
				<form
					method="POST"
					action="?/updatePrice"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
				>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
						<div>
							<Input
								label="Base Price (pence, e.g. 14900 = £149.00)"
								name="base_price"
								type="number"
								step="1"
								min="0"
								value={String(data.pricing?.base_price ?? 14900)}
								required
							/>
						</div>
						<div class="flex items-center gap-4">
							<Toggle
								label="Active"
								name="is_active"
								checked={data.pricing?.is_active ?? true}
							/>
						</div>
						<div>
							<Button type="submit" disabled={loading}>
								{#snippet children()}
									{loading ? 'Saving...' : 'Update Price'}
								{/snippet}
							</Button>
						</div>
					</div>
				</form>
			</div>
		{/snippet}
	</Card>

	<!-- Promo Codes -->
	<Card>
		{#snippet children()}
			<div class="p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-gray-900">Promo Codes</h2>
					<Button size="sm" onclick={() => showPromoModal = true}>
						{#snippet children()}
							<svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							Add Code
						{/snippet}
					</Button>
				</div>

				{#if data.promoCodes.length > 0}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead>
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discount</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uses</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid Until</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
									<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each data.promoCodes as promo}
									<tr>
										<td class="px-4 py-3">
											<code class="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{promo.code}</code>
										</td>
										<td class="px-4 py-3 text-sm">
											{promo.discount_type === 'percentage' 
												? `${promo.discount_value}%` 
												: formatCurrency(promo.discount_value)}
										</td>
										<td class="px-4 py-3 text-sm text-gray-500">
											{promo.current_uses} / {promo.max_uses || '∞'}
										</td>
										<td class="px-4 py-3 text-sm text-gray-500">
											{promo.valid_until ? formatDate(promo.valid_until) : 'No limit'}
										</td>
										<td class="px-4 py-3">
											{#if promo.is_active}
												<Badge variant="success">
													{#snippet children()}Active{/snippet}
												</Badge>
											{:else}
												<Badge variant="secondary">
													{#snippet children()}Inactive{/snippet}
												</Badge>
											{/if}
										</td>
										<td class="px-4 py-3 text-right">
											<form method="POST" action="?/togglePromo" class="inline">
												<input type="hidden" name="id" value={promo.id}>
												<input type="hidden" name="is_active" value={promo.is_active ? 'false' : 'true'}>
												<button type="submit" class="text-sm text-brand-600 hover:text-brand-500">
													{promo.is_active ? 'Deactivate' : 'Activate'}
												</button>
											</form>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="text-sm text-gray-500 text-center py-6">No promo codes yet.</p>
				{/if}
			</div>
		{/snippet}
	</Card>

	<!-- Recent Payments -->
	<Card>
		{#snippet children()}
			<div class="p-6">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h2>
				{#if data.payments.length > 0}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead>
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each data.payments as payment}
									<tr>
										<td class="px-4 py-3 text-sm text-gray-500">
											{formatDate(payment.created_at)}
										</td>
										<td class="px-4 py-3 text-sm">
											{payment.user?.email || 'Unknown'}
										</td>
										<td class="px-4 py-3 text-sm font-medium">
											{formatCurrency(payment.amount)}
										</td>
										<td class="px-4 py-3">
											{#if payment.status === 'succeeded'}
												<Badge variant="success">
													{#snippet children()}Succeeded{/snippet}
												</Badge>
											{:else if payment.status === 'pending'}
												<Badge variant="warning">
													{#snippet children()}Pending{/snippet}
												</Badge>
											{:else}
												<Badge variant="error">
													{#snippet children()}{payment.status}{/snippet}
												</Badge>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="text-sm text-gray-500 text-center py-6">No payments yet.</p>
				{/if}
			</div>
		{/snippet}
	</Card>
</div>

<!-- Add Promo Code Modal -->
{#if showPromoModal}
	<Modal open={showPromoModal} onclose={() => showPromoModal = false}>
		{#snippet children()}
			<div class="p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Add Promo Code</h3>
				<form
					method="POST"
					action="?/createPromo"
					use:enhance={() => {
						loading = true;
						return async ({ result, update }) => {
							loading = false;
							if (result.type === 'success') {
								showPromoModal = false;
							}
							await update();
						};
					}}
					class="space-y-4"
				>
					<Input
						label="Code"
						name="code"
						required
						placeholder="SAVE20"
					/>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
							<select name="discount_type" class="block w-full rounded-lg border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500">
								<option value="percentage">Percentage</option>
								<option value="fixed">Fixed Amount</option>
							</select>
						</div>
						<Input
							label="Discount Value"
							name="discount_value"
							type="number"
							required
							placeholder="20"
						/>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<Input
							label="Max Uses (optional)"
							name="max_uses"
							type="number"
							placeholder="100"
						/>
						<Input
							label="Valid Until (optional)"
							name="valid_until"
							type="date"
						/>
					</div>
					<Input
						label="Description (optional)"
						name="description"
						placeholder="New Year sale"
					/>
					<div class="flex justify-end gap-3 pt-4">
						<Button variant="secondary" onclick={() => showPromoModal = false}>
							{#snippet children()}Cancel{/snippet}
						</Button>
						<Button type="submit" disabled={loading}>
							{#snippet children()}
								{loading ? 'Creating...' : 'Create Code'}
							{/snippet}
						</Button>
					</div>
				</form>
			</div>
		{/snippet}
	</Modal>
{/if}
