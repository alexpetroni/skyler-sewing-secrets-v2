<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Stat from '#lib/components/admin/Stat.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const stats = $derived(data.stats);

	const kindLabels = { course: 'Course', bundle: 'Bundles', single: 'Single videos' } as const;
</script>

<AdminPage title="Dashboard" description="The last 30 days of the shop.">
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<Stat
			label="Revenue (30 days)"
			value={formatPence(stats.revenue)}
			hint={stats.refunded > 0 ? `${formatPence(stats.refunded)} refunded` : undefined}
			href="/admin/orders?status=paid"
		/>
		<Stat label="Orders (30 days)" value={stats.orders} href="/admin/orders" />
		<Stat label="New buyers" value={stats.newBuyers} href="/admin/users" />
		<Stat label="Unread messages" value={stats.unreadContacts} href="/admin/inbox" />
	</div>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
		<Card>
			<h2 class="mb-4 text-lg font-semibold text-gray-900">By product kind</h2>
			<ul class="divide-y divide-gray-100">
				{#each stats.byKind as row (row.kind)}
					<li class="flex items-center justify-between py-3 text-sm">
						<span class="font-medium text-gray-900">{kindLabels[row.kind]}</span>
						<span class="text-gray-500">
							{row.orders}
							{row.orders === 1 ? 'order' : 'orders'} ·
							<span class="font-semibold text-gray-900">{formatPence(row.revenue)}</span>
						</span>
					</li>
				{/each}
			</ul>
		</Card>

		<Card>
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Top products</h2>
			{#if stats.topProducts.length > 0}
				<ol class="divide-y divide-gray-100">
					{#each stats.topProducts as product (product.productId)}
						<li class="flex items-center justify-between py-3 text-sm">
							<span class="font-medium text-gray-900">{product.title}</span>
							<span class="text-gray-500">
								{product.units} sold ·
								<span class="font-semibold text-gray-900">{formatPence(product.revenue)}</span>
							</span>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="py-4 text-center text-sm text-gray-500">No sales in the last 30 days.</p>
			{/if}
		</Card>

		<Card>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Active promotions</h2>
				<a href="/admin/promotions" class="text-sm text-brand-600 hover:text-brand-500">View all</a>
			</div>
			{#if stats.activePromotions.length > 0}
				<ul class="divide-y divide-gray-100">
					{#each stats.activePromotions as promo (promo.id)}
						<li class="flex items-center justify-between py-3 text-sm">
							<span class="font-mono font-medium text-gray-900">{promo.code}</span>
							<span class="text-gray-500">
								{promo.redemptions}
								{promo.redemptions === 1 ? 'redemption' : 'redemptions'}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="py-4 text-center text-sm text-gray-500">No active promotions.</p>
			{/if}
		</Card>

		<Card>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Videos</h2>
				<a href="/admin/videos" class="text-sm text-brand-600 hover:text-brand-500">View all</a>
			</div>
			<ul class="divide-y divide-gray-100 text-sm">
				<li class="flex justify-between py-3">
					<span class="text-gray-900">Processing</span>
					<span class="font-semibold text-gray-900">{stats.media.processing}</span>
				</li>
				<li class="flex justify-between py-3">
					<span class="text-gray-900">Failed</span>
					<span class="font-semibold {stats.media.failed > 0 ? 'text-red-700' : 'text-gray-900'}">
						{stats.media.failed}
					</span>
				</li>
			</ul>
		</Card>
	</div>
</AdminPage>
