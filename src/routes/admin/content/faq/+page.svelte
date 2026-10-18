<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type FaqRow = (typeof data.faqs)[number];

	const columns: DataTableColumn<FaqRow>[] = [
		{ key: 'order', label: 'Order' },
		{ key: 'question', label: 'Question' },
		{ key: 'category', label: 'Category' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];

	// Questions move within their category; the list is already in category order.
	function canMove(faq: FaqRow, direction: -1 | 1): boolean {
		const neighbour = data.faqs[data.faqs.indexOf(faq) + direction];
		return neighbour !== undefined && neighbour.category === faq.category;
	}
</script>

<AdminPage title="FAQ" description="Manage frequently asked questions.">
	{#snippet actions()}
		<a href="/admin/content/faq/new" class="btn-primary btn-sm">New FAQ</a>
	{/snippet}

	<Form form={data.forms.move} action="?/moveUp">
		{#snippet children({ submitting })}
			<DataTable {columns} rows={data.faqs} empty="No FAQs yet.">
				{#snippet row(faq)}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="flex items-center gap-1">
								<button
									type="submit"
									name="id"
									value={faq.id}
									formaction="?/moveUp"
									class="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
									aria-label="Move “{faq.question}” up"
									disabled={submitting || !canMove(faq, -1)}>↑</button
								>
								<button
									type="submit"
									name="id"
									value={faq.id}
									formaction="?/moveDown"
									class="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
									aria-label="Move “{faq.question}” down"
									disabled={submitting || !canMove(faq, 1)}>↓</button
								>
								<span class="ml-1 text-sm text-gray-500">{faq.order_index}</span>
							</div>
						</td>
						<td class="px-6 py-4">
							<p class="line-clamp-2 max-w-md text-sm font-medium text-gray-900">{faq.question}</p>
						</td>
						<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
							{faq.category || 'General'}
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							{#if faq.is_published}
								<Badge variant="success" size="sm">Published</Badge>
							{:else}
								<Badge variant="secondary" size="sm">Draft</Badge>
							{/if}
						</td>
						<td class="px-6 py-4 text-right text-sm whitespace-nowrap">
							<a href="/admin/content/faq/{faq.id}" class="text-brand-600 hover:text-brand-500"
								>Edit</a
							>
						</td>
					</tr>
				{/snippet}
			</DataTable>
		{/snippet}
	</Form>
</AdminPage>
