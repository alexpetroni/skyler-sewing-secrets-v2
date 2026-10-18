<script lang="ts" generics="T">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import type { Snippet } from 'svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import type { DataTableColumn, DataTablePagination } from './types.ts';

	interface Props {
		columns: DataTableColumn<T>[];
		rows: T[];
		/** One `<tr>` per row. */
		row: Snippet<[T]>;
		pagination?: DataTablePagination;
		empty?: string;
	}

	let { columns, rows, row, pagination, empty = 'Nothing to show.' }: Props = $props();

	let sortKey = $state<string | null>(null);
	let descending = $state(false);

	const sorted = $derived.by(() => {
		const column = columns.find((entry) => entry.key === sortKey);
		const value = column?.sortValue;
		if (!value) return rows;
		return [...rows].sort((a, b) => {
			const left = value(a);
			const right = value(b);
			if (left === right) return 0;
			if (left === null) return 1;
			if (right === null) return -1;
			const order = left < right ? -1 : 1;
			return descending ? -order : order;
		});
	});

	function toggle(key: string) {
		if (sortKey === key) {
			descending = !descending;
		} else {
			sortKey = key;
			descending = false;
		}
	}

	function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
		if (sortKey !== key) return 'none';
		return descending ? 'descending' : 'ascending';
	}
</script>

<Card padding="none">
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					{#each columns as column (column.key)}
						<th
							scope="col"
							class="px-6 py-3 text-xs font-medium tracking-wider text-gray-500 uppercase {column.align ===
							'right'
								? 'text-right'
								: 'text-left'}"
							aria-sort={column.sortValue ? ariaSort(column.key) : undefined}
						>
							{#if column.sortValue}
								<button
									type="button"
									class="inline-flex items-center gap-1 uppercase hover:text-gray-700"
									onclick={() => toggle(column.key)}
								>
									{column.label}
									<span aria-hidden="true">
										{sortKey === column.key ? (descending ? '↓' : '↑') : '↕'}
									</span>
								</button>
							{:else}
								{column.label}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each sorted as item, index (index)}
					{@render row(item)}
				{:else}
					<tr>
						<td colspan={columns.length} class="px-6 py-12 text-center text-sm text-gray-500">
							{empty}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if pagination && pagination.pageCount > 1}
		<nav
			class="flex items-center justify-between border-t border-gray-200 px-6 py-3 text-sm"
			aria-label="Pagination"
		>
			<p class="text-gray-500">
				Page {pagination.page} of {pagination.pageCount} · {pagination.total} total
			</p>
			<div class="flex gap-4">
				{#if pagination.page > 1}
					<a class="text-brand-600 hover:text-brand-500" href={pagination.href(pagination.page - 1)}
						>Previous</a
					>
				{/if}
				{#if pagination.page < pagination.pageCount}
					<a class="text-brand-600 hover:text-brand-500" href={pagination.href(pagination.page + 1)}
						>Next</a
					>
				{/if}
			</div>
		</nav>
	{/if}
</Card>
