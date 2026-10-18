<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import { formatDateTime } from '#lib/components/admin/format.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import { orderStatuses } from '#lib/shared/schemas/admin.ts';
	import { statusVariant } from '#lib/components/admin/order-status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type OrderRow = (typeof data.orders.rows)[number];

	const columns: DataTableColumn<OrderRow>[] = [
		{ key: 'created', label: 'Created', sortValue: (row) => row.createdAt },
		{ key: 'buyer', label: 'Buyer', sortValue: (row) => row.email },
		{ key: 'status', label: 'Status', sortValue: (row) => row.status },
		{ key: 'items', label: 'Items', align: 'right' },
		{ key: 'total', label: 'Total', align: 'right', sortValue: (row) => row.total }
	];

	function pageHref(page: number): string {
		const { status = '', q } = data.filters;
		const params = Object.entries({ status, q, page: String(page) }).filter(([, value]) => value);
		return `/admin/orders?${new URLSearchParams(params)}`;
	}
</script>

<AdminPage title="Orders" description="Every checkout, its payment and what it granted.">
	<Card padding="sm">
		<form method="GET" class="flex flex-col gap-4 sm:flex-row">
			<div class="flex-1">
				<Input
					type="search"
					name="q"
					placeholder="Email, order id or Stripe id..."
					value={data.filters.q}
				/>
			</div>
			<select name="status" class="select sm:w-56" aria-label="Status">
				<option value="" selected={!data.filters.status}>All statuses</option>
				{#each orderStatuses as status (status)}
					<option value={status} selected={data.filters.status === status}>
						{status.replace('_', ' ')}
					</option>
				{/each}
			</select>
			<Button type="submit" variant="secondary">Filter</Button>
		</form>
	</Card>

	<DataTable
		{columns}
		rows={data.orders.rows}
		empty="No orders found."
		pagination={{ ...data.orders, href: pageHref }}
	>
		{#snippet row(order)}
			<tr class="hover:bg-gray-50">
				<td class="px-6 py-4 text-sm whitespace-nowrap">
					<a href="/admin/orders/{order.id}" class="text-brand-600 hover:text-brand-900">
						{formatDateTime(order.createdAt)}
					</a>
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
					<a href="/admin/users/{order.userId}" class="hover:text-brand-600">{order.email}</a>
				</td>
				<td class="px-6 py-4 whitespace-nowrap">
					<Badge variant={statusVariant[order.status]}>{order.status.replace('_', ' ')}</Badge>
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap text-gray-500">
					{order.itemCount}
				</td>
				<td class="px-6 py-4 text-right text-sm font-semibold whitespace-nowrap text-gray-900">
					{formatPence(order.total)}
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
