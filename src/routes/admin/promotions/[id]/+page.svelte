<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { untrack } from 'svelte';
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import { formatDateTime } from '#lib/components/admin/format.ts';
	import { statusVariant } from '#lib/components/admin/order-status.ts';
	import { promoStatusBadge } from '#lib/components/admin/promo-status.ts';
	import PromoFields from '#lib/components/admin/PromoFields.svelte';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import { generatePromoCode } from '#lib/shared/schemas/commerce.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const promo = $derived(data.promo);
	// Once redeemed, the code is part of order history and keeps its name.
	const codeLocked = $derived(data.promo.redemptionCount > 0);
	let code = $state(untrack(() => data.promo.code));

	type RedemptionRow = (typeof data.redemptions)[number];

	const columns: DataTableColumn<RedemptionRow>[] = [
		{ key: 'order', label: 'Order' },
		{ key: 'buyer', label: 'Buyer', sortValue: (row) => row.userEmail },
		{ key: 'discount', label: 'Discount', align: 'right', sortValue: (row) => row.discountTotal },
		{ key: 'date', label: 'Date', sortValue: (row) => row.createdAt },
		{ key: 'status', label: 'Order status', sortValue: (row) => row.orderStatus }
	];
</script>

<AdminPage title="Promotion {promo.code}" description={promo.description ?? undefined}>
	{#snippet actions()}
		<Badge variant={promoStatusBadge[promo.status].variant}>
			{promoStatusBadge[promo.status].label}
		</Badge>
		<a href="/admin/promotions" class="btn-ghost btn-sm">All promotions</a>
	{/snippet}

	<Form form={data.forms.update} action="?/update" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<div class="mb-6 flex items-end gap-3">
					<div class="flex-1">
						<Input
							label="Code"
							name="code"
							autocomplete="off"
							required
							readonly={codeLocked}
							bind:value={code}
							hint={codeLocked
								? 'Fixed: orders already used this code'
								: '2–32 letters, numbers, hyphens or underscores'}
							error={errors.code?.[0]}
						/>
					</div>
					{#if !codeLocked}
						<Button variant="secondary" onclick={() => (code = generatePromoCode())}
							>Generate</Button
						>
					{/if}
				</div>
				<PromoFields {promo} products={data.products} {errors} />
				<div class="mt-6 flex justify-end border-t border-gray-200 pt-4">
					<Button type="submit" loading={submitting}>Save Changes</Button>
				</div>
			</Card>
		{/snippet}
	</Form>

	<Card>
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-gray-900">
				Redemptions
				<span class="font-normal text-gray-500">
					· {promo.redemptionCount} / {promo.max_redemptions ?? '∞'}
				</span>
			</h2>
			{#if data.redemptions.length > 0}
				<a href="/admin/promotions/{promo.id}/redemptions.csv" class="btn-secondary btn-sm"
					>Export CSV</a
				>
			{/if}
		</div>
		<DataTable {columns} rows={data.redemptions} empty="Nobody has used this code yet.">
			{#snippet row(redemption)}
				<tr class="hover:bg-gray-50">
					<td class="px-6 py-4 text-sm whitespace-nowrap">
						<a
							href="/admin/orders/{redemption.orderId}"
							class="font-mono text-brand-600 hover:text-brand-900"
							>{redemption.orderId.slice(0, 8)}</a
						>
					</td>
					<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
						<a href="/admin/users/{redemption.userId}" class="hover:text-brand-600"
							>{redemption.userEmail}</a
						>
					</td>
					<td class="px-6 py-4 text-right text-sm whitespace-nowrap text-gray-900">
						{formatPence(redemption.discountTotal)}
					</td>
					<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
						{formatDateTime(redemption.createdAt)}
					</td>
					<td class="px-6 py-4 whitespace-nowrap">
						<Badge size="sm" variant={statusVariant[redemption.orderStatus]}>
							{redemption.orderStatus.replace('_', ' ')}
						</Badge>
					</td>
				</tr>
			{/snippet}
		</DataTable>
	</Card>

	<Card>
		<h2 class="mb-2 text-lg font-semibold text-gray-900">
			{promo.is_active ? 'Deactivate' : 'Activate'}
		</h2>
		<Form
			form={data.forms.active}
			action={promo.is_active ? '?/deactivate' : '?/activate'}
			class="space-y-4"
		>
			{#snippet children({ submitting })}
				<p class="text-sm text-gray-600">
					{promo.is_active
						? 'Buyers can no longer apply the code; its history stays.'
						: 'Buyers can apply the code again inside its window.'}
				</p>
				<Button
					type="submit"
					size="sm"
					variant={promo.is_active ? 'danger' : 'secondary'}
					loading={submitting}
				>
					{promo.is_active ? 'Deactivate Code' : 'Activate Code'}
				</Button>
			{/snippet}
		</Form>
	</Card>

	{#if data.redemptions.length === 0}
		<Card>
			<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete Promotion</h2>
			<ConfirmForm
				form={data.forms.remove}
				action="?/delete"
				phrase={DELETE_PHRASE}
				label="Delete Promotion"
				description="Only a code nobody has used can be deleted; a used code is deactivated instead."
			/>
		</Card>
	{/if}
</AdminPage>
