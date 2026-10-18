<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import { formatDuration, mediaStatusBadge } from '#lib/components/admin/media-status.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type VideoRow = (typeof data.library.items)[number];

	const columns: DataTableColumn<VideoRow>[] = [
		{ key: 'video', label: 'Video' },
		{ key: 'duration', label: 'Duration' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: 'Import', align: 'right' }
	];

	function query(page: number): string {
		const params = Object.entries({ q: data.q, page: String(page) }).filter(([, value]) => value);
		return `?${new URLSearchParams(params)}`;
	}
</script>

<AdminPage title="Import from Bunny" description="Videos already in the Bunny Stream library.">
	{#snippet actions()}
		<a href="/admin/media" class="btn-ghost btn-sm">All videos</a>
	{/snippet}

	<Card padding="sm">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
			<form method="GET" class="flex flex-1 gap-4">
				<div class="flex-1">
					<Input type="search" name="q" placeholder="Search Bunny..." value={data.q} />
				</div>
				<Button type="submit" variant="secondary">Search</Button>
			</form>
			<Form form={data.forms.importPage} action="{query(data.library.page)}&/importPage">
				{#snippet children({ submitting })}
					<Button type="submit" loading={submitting} disabled={data.library.items.length === 0}>
						Import this page
					</Button>
				{/snippet}
			</Form>
		</div>
	</Card>

	<Form form={data.forms.importVideo} action="?/importVideo">
		{#snippet children({ submitting })}
			<DataTable
				{columns}
				rows={data.library.items}
				empty="No videos in the library match."
				pagination={{ ...data.library, href: (page) => `/admin/media/import${query(page)}` }}
			>
				{#snippet row(video)}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-4">
							<div class="flex items-center gap-4">
								{#if video.thumbnailUrl}
									<img
										src={video.thumbnailUrl}
										alt=""
										class="h-12 w-20 rounded bg-gray-100 object-cover"
									/>
								{:else}
									<div class="h-12 w-20 rounded bg-gray-100"></div>
								{/if}
								<span class="text-sm font-medium text-gray-900">{video.title}</span>
							</div>
						</td>
						<td class="px-6 py-4 text-sm text-gray-700">{formatDuration(video.lengthSeconds)}</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<Badge size="sm" variant={mediaStatusBadge[video.status].variant}>
								{mediaStatusBadge[video.status].label}
							</Badge>
						</td>
						<td class="px-6 py-4 text-right text-sm whitespace-nowrap">
							{#if video.assetId}
								<a href="/admin/media/{video.assetId}" class="text-brand-600 hover:text-brand-500"
									>Imported</a
								>
							{:else}
								<button
									type="submit"
									name="videoId"
									value={video.videoId}
									class="font-medium text-brand-600 hover:text-brand-500"
									disabled={submitting}>Import</button
								>
							{/if}
						</td>
					</tr>
				{/snippet}
			</DataTable>
		{/snippet}
	</Form>
</AdminPage>
