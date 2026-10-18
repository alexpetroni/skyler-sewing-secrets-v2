<script lang="ts">
	import type { PageData } from './$types';
	import { Card, Button, Badge } from '$lib/components/ui';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'Not published';
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Blog Posts - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Blog Posts</h1>
			<p class="mt-1 text-sm text-gray-500">Manage blog content.</p>
		</div>
		<a href="/admin/blog/new">
			<Button>
				{#snippet children()}
					<svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					New Post
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
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Post</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Published</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.posts as post}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4">
									<div class="flex items-center">
										{#if post.featured_image_url}
											<OptimizedImage
												class="h-10 w-16 rounded object-cover"
												src={post.featured_image_url}
												alt=""
												width={64}
											/>
										{:else}
											<div class="h-10 w-16 rounded bg-gray-200 flex items-center justify-center">
												<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0-9-9Z" />
												</svg>
											</div>
										{/if}
										<div class="ml-4">
											<div class="text-sm font-medium text-gray-900">{post.title}</div>
											<div class="text-sm text-gray-500">/{post.slug}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if post.is_published}
										<Badge variant="success">
											{#snippet children()}Published{/snippet}
										</Badge>
									{:else}
										<Badge variant="secondary">
											{#snippet children()}Draft{/snippet}
										</Badge>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDate(post.published_at)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<a href="/admin/blog/{post.id}" class="text-brand-600 hover:text-brand-900">
										Edit
									</a>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="4" class="px-6 py-12 text-center text-sm text-gray-500">
									No posts yet. <a href="/admin/blog/new" class="text-brand-600 hover:text-brand-500">Create the first one</a>.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>
