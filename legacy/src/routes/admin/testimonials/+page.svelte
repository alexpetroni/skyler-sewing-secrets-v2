<script lang="ts">
	import type { PageData } from './$types';
	import { Card, Button, Badge } from '$lib/components/ui';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function renderStars(rating: number | null): number {
		return rating ?? 5;
	}
</script>

<svelte:head>
	<title>Testimonials - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Testimonials</h1>
			<p class="mt-1 text-sm text-gray-500">Manage student testimonials.</p>
		</div>
		<a href="/admin/testimonials/new">
			<Button>
				{#snippet children()}
					<svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					New Testimonial
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
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Author</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.testimonials as testimonial}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{testimonial.order_index}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if testimonial.author_avatar_url}
											<OptimizedImage
												class="h-8 w-8 rounded-full"
												src={testimonial.author_avatar_url}
												alt=""
												width={32}
											/>
										{:else}
											<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
												<span class="text-xs font-medium text-gray-600">
													{testimonial.author_name.charAt(0)}
												</span>
											</div>
										{/if}
										<div class="ml-3">
											<div class="text-sm font-medium text-gray-900">{testimonial.author_name}</div>
											{#if testimonial.author_title}
												<div class="text-xs text-gray-500">{testimonial.author_title}</div>
											{/if}
										</div>
									</div>
								</td>
								<td class="px-6 py-4">
									<p class="text-sm text-gray-600 line-clamp-2 max-w-xs">{testimonial.content}</p>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex">
										{#each Array(renderStars(testimonial.rating)) as _}
											<svg class="h-4 w-4 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clip-rule="evenodd" />
											</svg>
										{/each}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex gap-1">
										{#if testimonial.is_published}
											<Badge variant="success">
												{#snippet children()}Published{/snippet}
											</Badge>
										{:else}
											<Badge variant="secondary">
												{#snippet children()}Draft{/snippet}
											</Badge>
										{/if}
										{#if testimonial.is_featured}
											<Badge variant="warning">
												{#snippet children()}Featured{/snippet}
											</Badge>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<a href="/admin/testimonials/{testimonial.id}" class="text-brand-600 hover:text-brand-900">
										Edit
									</a>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="6" class="px-6 py-12 text-center text-sm text-gray-500">
									No testimonials yet. <a href="/admin/testimonials/new" class="text-brand-600 hover:text-brand-500">Add the first one</a>.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>
