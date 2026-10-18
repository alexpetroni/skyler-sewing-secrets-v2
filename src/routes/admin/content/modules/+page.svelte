<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type ModuleRow = (typeof data.modules)[number];

	const columns: DataTableColumn<ModuleRow>[] = [
		{ key: 'order', label: 'Order' },
		{ key: 'module', label: 'Module' },
		{ key: 'lessons', label: 'Lessons', align: 'right' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];
</script>

<AdminPage title="Modules" description="Manage the course modules and their order.">
	{#snippet actions()}
		<a href="/admin/content/lessons" class="btn-ghost btn-sm">All lessons</a>
		<a href="/admin/content/modules/new" class="btn-primary btn-sm">New module</a>
	{/snippet}

	<Form form={data.forms.move} action="?/moveUp">
		{#snippet children({ submitting })}
			<DataTable {columns} rows={data.modules} empty="No modules yet.">
				{#snippet row(module)}
					{@const index = data.modules.indexOf(module)}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="flex items-center gap-1">
								<button
									type="submit"
									name="id"
									value={module.id}
									formaction="?/moveUp"
									class="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
									aria-label="Move {module.title} up"
									disabled={submitting || index === 0}>↑</button
								>
								<button
									type="submit"
									name="id"
									value={module.id}
									formaction="?/moveDown"
									class="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
									aria-label="Move {module.title} down"
									disabled={submitting || index === data.modules.length - 1}>↓</button
								>
							</div>
						</td>
						<td class="px-6 py-4">
							<div class="text-sm font-medium text-gray-900">{module.title}</div>
							<div class="text-sm text-gray-500">/{module.slug}</div>
						</td>
						<td class="px-6 py-4 text-right text-sm text-gray-700">{module.lessonCount}</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="flex flex-wrap gap-1">
								{#if module.is_published}
									<Badge variant="success" size="sm">Published</Badge>
								{:else}
									<Badge variant="secondary" size="sm">Draft</Badge>
								{/if}
								{#if module.is_bonus}<Badge variant="primary" size="sm">Bonus</Badge>{/if}
							</div>
						</td>
						<td class="px-6 py-4 text-right text-sm whitespace-nowrap">
							<a
								href="/admin/content/modules/{module.id}"
								class="text-brand-600 hover:text-brand-500">Edit</a
							>
						</td>
					</tr>
				{/snippet}
			</DataTable>
		{/snippet}
	</Form>
</AdminPage>
