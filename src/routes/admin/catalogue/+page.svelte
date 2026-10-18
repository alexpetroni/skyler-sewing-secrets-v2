<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type ProductRow = (typeof data.products)[number];

	const columns: DataTableColumn<ProductRow>[] = [
		{ key: 'title', label: 'Product', sortValue: (row) => row.title },
		{ key: 'kind', label: 'Kind', sortValue: (row) => row.kind },
		{ key: 'price', label: 'Price', align: 'right', sortValue: (row) => row.pricing.price },
		{ key: 'items', label: 'Videos', align: 'right', sortValue: (row) => row.itemCount },
		{ key: 'status', label: 'Status' },
		{ key: 'order', label: 'Order', align: 'right', sortValue: (row) => row.sort_order }
	];
</script>

<AdminPage
	title="Catalogue"
	description="The course, bundles and single videos, in the order the catalogue shows them."
>
	{#snippet actions()}
		<a href="/admin/catalogue/new?kind=bundle" class="btn-primary btn-sm">New bundle</a>
		<a href="/admin/catalogue/new?kind=single" class="btn-secondary btn-sm">New single</a>
	{/snippet}

	<DataTable {columns} rows={data.products} empty="No products yet.">
		{#snippet row(product)}
			<tr class="hover:bg-gray-50">
				<td class="px-6 py-4 text-sm">
					<a
						href="/admin/catalogue/{product.id}"
						class="font-medium text-brand-600 hover:text-brand-900">{product.title}</a
					>
					<p class="text-gray-500">/products/{product.slug}</p>
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500 capitalize">{product.kind}</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap">
					{#if product.pricing.onSale}
						<span class="text-gray-400 line-through">{formatPence(product.pricing.listPrice)}</span>
						<span class="font-semibold text-gray-900">{formatPence(product.pricing.price)}</span>
					{:else}
						<span class="font-semibold text-gray-900">{formatPence(product.price)}</span>
						{#if product.sale_price !== null}
							<p class="text-[13px] text-gray-500">
								Sale {formatPence(product.sale_price)} scheduled
							</p>
						{/if}
					{/if}
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap text-gray-500">
					{product.itemCount}
				</td>
				<td class="px-6 py-4 whitespace-nowrap">
					<div class="flex gap-1.5">
						{#if product.is_published}
							<Badge variant="success" size="sm">Published</Badge>
						{:else}
							<Badge variant="gray" size="sm">Draft</Badge>
						{/if}
						{#if product.is_featured}
							<Badge variant="brand" size="sm">Featured</Badge>
						{/if}
					</div>
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap text-gray-500">
					{product.sort_order}
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
