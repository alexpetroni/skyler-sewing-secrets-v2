<script lang="ts">
	import type { PageData } from './$types';
	import { Card, Button, Badge } from '$lib/components/ui';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>FAQ - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">FAQ</h1>
			<p class="mt-1 text-sm text-gray-500">Manage frequently asked questions.</p>
		</div>
		<a href="/admin/faq/new">
			<Button>
				{#snippet children()}
					<svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					New FAQ
				{/snippet}
			</Button>
		</a>
	</div>

	<Card>
		{#snippet children()}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Question</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.faqs as faq}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{faq.order_index}
								</td>
								<td class="px-6 py-4">
									<p class="text-sm font-medium text-gray-900 line-clamp-2 max-w-md">{faq.question}</p>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{faq.category || 'General'}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if faq.is_published}
										<Badge variant="success">
											{#snippet children()}Published{/snippet}
										</Badge>
									{:else}
										<Badge variant="secondary">
											{#snippet children()}Draft{/snippet}
										</Badge>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<a href="/admin/faq/{faq.id}" class="text-brand-600 hover:text-brand-900">
										Edit
									</a>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-6 py-12 text-center text-sm text-gray-500">
									No FAQs yet. <a href="/admin/faq/new" class="text-brand-600 hover:text-brand-500">Add the first one</a>.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>
