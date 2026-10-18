<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import { mediaStatusBadge } from '#lib/components/admin/media-status.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type LessonRow = (typeof data.lessons)[number];

	const columns: DataTableColumn<LessonRow>[] = [
		{ key: 'lesson', label: 'Lesson', sortValue: (row) => row.lesson.title },
		{ key: 'module', label: 'Module', sortValue: (row) => row.moduleTitle ?? '' },
		{ key: 'media', label: 'Video' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];
</script>

<AdminPage title="Lessons" description="Course lessons and standalone videos.">
	{#snippet actions()}
		<a href="/admin/content/modules" class="btn-ghost btn-sm">Modules</a>
		<a href="/admin/content/lessons/new" class="btn-primary btn-sm">New lesson</a>
	{/snippet}

	<Card padding="sm">
		<form method="GET" class="flex flex-col gap-4 sm:flex-row sm:items-end">
			<div class="flex-1">
				<Select label="Module" name="module" value={data.query.module ?? ''}>
					<option value="">Any module</option>
					{#each data.modules as module (module.id)}
						<option value={module.id}>{module.title}</option>
					{/each}
				</Select>
			</div>
			<div class="flex-1">
				<Select label="Show" name="filter" value={data.query.filter ?? ''}>
					<option value="">All lessons</option>
					<option value="standalone">Standalone videos</option>
					<option value="unpublished">Unpublished</option>
					<option value="media-not-ready">Video not ready</option>
				</Select>
			</div>
			<Button type="submit" variant="secondary">Filter</Button>
		</form>
	</Card>

	<DataTable {columns} rows={data.lessons} empty="No lessons match.">
		{#snippet row({ lesson, moduleTitle, mediaStatus })}
			<tr class="hover:bg-gray-50">
				<td class="px-6 py-4">
					<div class="text-sm font-medium text-gray-900">{lesson.title}</div>
					<div class="text-sm text-gray-500">/{lesson.slug}</div>
				</td>
				<td class="px-6 py-4 text-sm text-gray-700">{moduleTitle ?? 'Standalone video'}</td>
				<td class="px-6 py-4 whitespace-nowrap">
					{#if mediaStatus}
						<Badge size="sm" variant={mediaStatusBadge[mediaStatus].variant}>
							{mediaStatusBadge[mediaStatus].label}
						</Badge>
					{:else if lesson.kind === 'video'}
						<Badge size="sm" variant="warning">No video</Badge>
					{:else}
						<span class="text-sm text-gray-500">Article</span>
					{/if}
				</td>
				<td class="px-6 py-4 whitespace-nowrap">
					<div class="flex flex-wrap gap-1">
						{#if lesson.is_published}
							<Badge variant="success" size="sm">Published</Badge>
						{:else}
							<Badge variant="secondary" size="sm">Draft</Badge>
						{/if}
						{#if lesson.is_free_preview}
							<Badge variant="primary" size="sm">Free Preview</Badge>
						{/if}
					</div>
				</td>
				<td class="px-6 py-4 text-right text-sm whitespace-nowrap">
					<a href="/admin/content/lessons/{lesson.id}" class="text-brand-600 hover:text-brand-500"
						>Edit</a
					>
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
