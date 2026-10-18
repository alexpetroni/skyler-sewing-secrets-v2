<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import { formatDate } from '#lib/components/admin/format.ts';
	import Stat from '#lib/components/admin/Stat.svelte';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import type { SubscriberStatus } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type SubscriberRow = (typeof data.subscribers)[number];

	const columns: DataTableColumn<SubscriberRow>[] = [
		{ key: 'email', label: 'Email', sortValue: (row) => row.email },
		{ key: 'status', label: 'Status' },
		{ key: 'subscribed', label: 'Subscribed', sortValue: (row) => row.subscribed_at }
	];

	const filters: Array<{ status: SubscriberStatus | null; label: string }> = [
		{ status: null, label: 'All' },
		{ status: 'confirmed', label: 'Confirmed' },
		{ status: 'unconfirmed', label: 'Unconfirmed' },
		{ status: 'unsubscribed', label: 'Unsubscribed' }
	];

	const badges = {
		confirmed: { variant: 'success', label: 'Confirmed' },
		unconfirmed: { variant: 'warning', label: 'Unconfirmed' },
		unsubscribed: { variant: 'secondary', label: 'Unsubscribed' }
	} as const;
</script>

<AdminPage title="Newsletter Subscribers" description="{data.counts.total} total subscribers">
	{#snippet actions()}
		<a href="/admin/inbox/subscribers/export.csv" class="btn-secondary btn-sm" download
			>Export CSV</a
		>
	{/snippet}

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<Stat label="Confirmed" value={data.counts.confirmed} />
		<Stat label="Unconfirmed" value={data.counts.unconfirmed} />
		<Stat label="Unsubscribed" value={data.counts.unsubscribed} />
	</div>

	<nav class="flex flex-wrap gap-2" aria-label="Filter subscribers">
		{#each filters as filter (filter.label)}
			<a
				href={filter.status
					? `/admin/inbox/subscribers?status=${filter.status}`
					: '/admin/inbox/subscribers'}
				class={data.status === filter.status ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
				aria-current={data.status === filter.status ? 'page' : undefined}>{filter.label}</a
			>
		{/each}
	</nav>

	<DataTable {columns} rows={data.subscribers} empty="No subscribers yet.">
		{#snippet row(subscriber)}
			<tr class="hover:bg-gray-50">
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">{subscriber.email}</td>
				<td class="px-6 py-4 whitespace-nowrap">
					<Badge variant={badges[subscriber.status].variant} size="sm"
						>{badges[subscriber.status].label}</Badge
					>
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
					{formatDate(subscriber.subscribed_at)}
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
