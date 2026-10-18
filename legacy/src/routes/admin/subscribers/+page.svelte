<script lang="ts">
	import type { PageData } from './$types';
	import { Card, Badge, Button } from '$lib/components/ui';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function downloadCSV() {
		const headers = ['Email', 'Status', 'Subscribed At'];
		const rows = data.subscribers.map(s => [
			s.email,
			s.is_active ? 'Active' : 'Unsubscribed',
			s.subscribed_at
		]);

		const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Newsletter Subscribers - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Newsletter Subscribers</h1>
			<p class="mt-1 text-sm text-gray-500">{data.subscribers.length} total subscribers</p>
		</div>
		<Button variant="secondary" onclick={downloadCSV}>
			{#snippet children()}
				<svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
				</svg>
				Export CSV
			{/snippet}
		</Button>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<Card>
			{#snippet children()}
				<div class="p-4 text-center">
					<p class="text-2xl font-bold text-gray-900">{data.subscribers.length}</p>
					<p class="text-sm text-gray-500">Total</p>
				</div>
			{/snippet}
		</Card>
		<Card>
			{#snippet children()}
				<div class="p-4 text-center">
					<p class="text-2xl font-bold text-green-600">{data.subscribers.filter(s => s.is_active).length}</p>
					<p class="text-sm text-gray-500">Active</p>
				</div>
			{/snippet}
		</Card>
		<Card>
			{#snippet children()}
				<div class="p-4 text-center">
					<p class="text-2xl font-bold text-gray-400">{data.subscribers.filter(s => !s.is_active).length}</p>
					<p class="text-sm text-gray-500">Unsubscribed</p>
				</div>
			{/snippet}
		</Card>
	</div>

	<Card>
		{#snippet children()}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subscribed</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.subscribers as subscriber}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{subscriber.email}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if subscriber.is_active}
										<Badge variant="success">
											{#snippet children()}Active{/snippet}
										</Badge>
									{:else}
										<Badge variant="secondary">
											{#snippet children()}Unsubscribed{/snippet}
										</Badge>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDate(subscriber.subscribed_at)}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="3" class="px-6 py-12 text-center text-sm text-gray-500">
									No subscribers yet.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>
