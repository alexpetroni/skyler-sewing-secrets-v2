<script lang="ts">
	import type { PageData } from './$types';
	import { Card, Button, Badge } from '$lib/components/ui';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

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
</script>

<svelte:head>
	<title>Modules - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Modules</h1>
			<p class="mt-1 text-sm text-gray-500">Manage course modules.</p>
		</div>
		<a href="/admin/modules/new">
			<Button>
				{#snippet children()}
					<svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					New Module
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
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lessons</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.modules as module}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{module.order_index}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if module.thumbnail_url}
											<OptimizedImage class="h-10 w-10 rounded object-cover" src={module.thumbnail_url} alt={module.title} width={40} />
										{:else}
											<div class="h-10 w-10 rounded bg-gray-200 flex items-center justify-center">
												<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75" />
												</svg>
											</div>
										{/if}
										<div class="ml-4">
											<div class="text-sm font-medium text-gray-900">{module.title}</div>
											<div class="text-sm text-gray-500">/{module.slug}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{module.lessons_count || 0} lessons
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex gap-1">
										{#if module.is_published}
											<Badge variant="success">
												{#snippet children()}Published{/snippet}
											</Badge>
										{:else}
											<Badge variant="secondary">
												{#snippet children()}Draft{/snippet}
											</Badge>
										{/if}
										{#if module.is_bonus}
											<Badge variant="warning">
												{#snippet children()}Bonus{/snippet}
											</Badge>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDate(module.created_at)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<a href="/admin/modules/{module.id}" class="text-brand-600 hover:text-brand-900">
										Edit
									</a>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="6" class="px-6 py-12 text-center text-sm text-gray-500">
									No modules yet. <a href="/admin/modules/new" class="text-brand-600 hover:text-brand-500">Create the first one</a>.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>
