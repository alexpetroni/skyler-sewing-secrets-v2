<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import { formatDate } from '#lib/components/admin/format.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import OptimizedImage from '#lib/components/ui/OptimizedImage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type PostRow = (typeof data.posts)[number];

	const columns: DataTableColumn<PostRow>[] = [
		{ key: 'post', label: 'Post', sortValue: (post) => post.title },
		{ key: 'status', label: 'Status' },
		{ key: 'published', label: 'Published', sortValue: (post) => post.published_at },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];
</script>

<AdminPage title="Blog Posts" description="Manage blog content.">
	{#snippet actions()}
		<a href="/admin/content/blog/new" class="btn-primary btn-sm">New Post</a>
	{/snippet}

	<DataTable {columns} rows={data.posts} empty="No posts yet.">
		{#snippet row(post)}
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
							<div class="h-10 w-16 rounded bg-gray-200"></div>
						{/if}
						<div class="ml-4">
							<div class="text-sm font-medium text-gray-900">{post.title}</div>
							<div class="text-sm text-gray-500">/{post.slug}</div>
						</div>
					</div>
				</td>
				<td class="px-6 py-4 whitespace-nowrap">
					{#if post.is_published}
						<Badge variant="success" size="sm">Published</Badge>
					{:else}
						<Badge variant="secondary" size="sm">Draft</Badge>
					{/if}
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
					{post.published_at ? formatDate(post.published_at) : 'Not published'}
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap">
					<a href="/admin/content/blog/{post.id}" class="text-brand-600 hover:text-brand-500"
						>Edit</a
					>
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
