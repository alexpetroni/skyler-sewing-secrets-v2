<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import { formatDate } from '#lib/components/admin/format.ts';
	import { promoStatusBadge } from '#lib/components/admin/promo-status.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type CodeRow = (typeof data.codes)[number];

	const columns: DataTableColumn<CodeRow>[] = [
		{ key: 'code', label: 'Code', sortValue: (row) => row.code },
		{ key: 'scope', label: 'Scope' },
		{ key: 'value', label: 'Discount', align: 'right' },
		{
			key: 'redemptions',
			label: 'Redemptions',
			align: 'right',
			sortValue: (r) => r.redemptionCount
		},
		{ key: 'window', label: 'Window', sortValue: (row) => row.endsAt },
		{ key: 'status', label: 'Status', sortValue: (row) => row.status }
	];

	const filters = [
		{ value: '', label: 'All' },
		{ value: 'active', label: 'Active' },
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'exhausted', label: 'Used up' }
	];
</script>

<AdminPage
	title="Promotions"
	description="Discount codes, their scope and how often they were used."
>
	{#snippet actions()}
		<a href="/admin/promotions/new" class="btn-primary btn-sm">New code</a>
		<a href="/admin/promotions/bulk" class="btn-secondary btn-sm">Bulk generate</a>
	{/snippet}

	<nav class="flex flex-wrap gap-2" aria-label="Filter by status">
		{#each filters as filter (filter.value)}
			{@const current = (data.status ?? '') === filter.value}
			<a
				href={filter.value ? `/admin/promotions?status=${filter.value}` : '/admin/promotions'}
				class="rounded-full px-3 py-1.5 text-sm font-medium {current
					? 'bg-brand-600 text-white'
					: 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}"
				aria-current={current ? 'page' : undefined}>{filter.label}</a
			>
		{/each}
	</nav>

	<DataTable {columns} rows={data.codes} empty="No promotions found.">
		{#snippet row(code)}
			<tr class="hover:bg-gray-50">
				<td class="px-6 py-4 text-sm whitespace-nowrap">
					<a
						href="/admin/promotions/{code.id}"
						class="rounded bg-gray-100 px-2 py-1 font-mono text-brand-700 hover:text-brand-900"
						>{code.code}</a
					>
					{#if code.description}
						<p class="mt-1 text-gray-500">{code.description}</p>
					{/if}
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
					{code.appliesTo === 'all'
						? 'All products'
						: `${code.productCount} product${code.productCount === 1 ? '' : 's'}`}
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap text-gray-900">
					{code.discountType === 'percentage'
						? `${code.discountValue}%`
						: formatPence(code.discountValue)}
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap text-gray-500">
					{code.redemptionCount} / {code.maxRedemptions ?? '∞'}
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
					{code.startsAt ? formatDate(code.startsAt) : 'Now'} – {code.endsAt
						? formatDate(code.endsAt)
						: 'No end'}
				</td>
				<td class="px-6 py-4 whitespace-nowrap">
					<Badge size="sm" variant={promoStatusBadge[code.status].variant}>
						{promoStatusBadge[code.status].label}
					</Badge>
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
