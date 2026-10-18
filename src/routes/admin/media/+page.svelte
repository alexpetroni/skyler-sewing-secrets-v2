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
	import Select from '#lib/components/ui/Select.svelte';
	import { mediaStatuses } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type AssetRow = (typeof data.assets)[number];

	const columns: DataTableColumn<AssetRow>[] = [
		{ key: 'video', label: 'Video', sortValue: (row) => row.title ?? '' },
		{ key: 'duration', label: 'Duration', sortValue: (row) => row.duration_seconds },
		{ key: 'status', label: 'Status', sortValue: (row) => row.status },
		{ key: 'lesson', label: 'Lesson' },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];
</script>

<AdminPage
	title="Videos"
	description="The Bunny Stream library: uploads, imports and encoding status."
>
	{#snippet actions()}
		<a href="/admin/media/import" class="btn-ghost btn-sm">Import from Bunny</a>
		<a href="/admin/media/upload" class="btn-primary btn-sm">Upload</a>
	{/snippet}

	<Card padding="sm">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-end">
			<form method="GET" class="flex flex-1 flex-col gap-4 sm:flex-row sm:items-end">
				<div class="flex-1">
					<Input type="search" name="q" placeholder="Search by title..." value={data.query.q} />
				</div>
				<Select name="status" value={data.query.status ?? ''} aria-label="Status">
					<option value="">All statuses</option>
					{#each mediaStatuses as status (status)}
						<option value={status}>{mediaStatusBadge[status].label}</option>
					{/each}
				</Select>
				<Button type="submit" variant="secondary">Search</Button>
			</form>
			<Form form={data.forms.sync} action="?/sync">
				{#snippet children({ submitting })}
					<Button type="submit" variant="secondary" loading={submitting}>Sync now</Button>
				{/snippet}
			</Form>
		</div>
	</Card>

	<DataTable {columns} rows={data.assets} empty="No videos yet.">
		{#snippet row(asset)}
			<tr class="hover:bg-gray-50">
				<td class="px-6 py-4">
					<div class="flex items-center gap-4">
						{#if asset.thumbnail_url}
							<img
								src={asset.thumbnail_url}
								alt=""
								class="h-12 w-20 rounded bg-gray-100 object-cover"
							/>
						{:else}
							<div class="h-12 w-20 rounded bg-gray-100"></div>
						{/if}
						<span class="text-sm font-medium text-gray-900">{asset.title ?? 'Untitled'}</span>
					</div>
				</td>
				<td class="px-6 py-4 text-sm text-gray-700">{formatDuration(asset.duration_seconds)}</td>
				<td class="px-6 py-4 whitespace-nowrap">
					<Badge size="sm" variant={mediaStatusBadge[asset.status].variant}>
						{mediaStatusBadge[asset.status].label}
					</Badge>
				</td>
				<td class="px-6 py-4 text-sm">
					{#if asset.linkedLessonId}
						<a
							href="/admin/content/lessons/{asset.linkedLessonId}"
							class="text-brand-600 hover:text-brand-500">Linked lesson</a
						>
					{:else}
						<span class="text-gray-500">Not used</span>
					{/if}
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap">
					<a href="/admin/media/{asset.id}" class="text-brand-600 hover:text-brand-500">Details</a>
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
