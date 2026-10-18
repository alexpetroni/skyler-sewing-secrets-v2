<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type TestimonialRow = (typeof data.testimonials)[number];

	const columns: DataTableColumn<TestimonialRow>[] = [
		{ key: 'order', label: 'Order' },
		{ key: 'author', label: 'Author' },
		{ key: 'content', label: 'Content' },
		{ key: 'rating', label: 'Rating' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];

	// Published testimonials follow the pending ones, already in display order.
	const published = $derived(data.testimonials.filter((row) => row.is_published));

	function canMove(row: TestimonialRow, direction: -1 | 1): boolean {
		const index = published.indexOf(row);
		return index !== -1 && published[index + direction] !== undefined;
	}

	const linkButton = 'text-sm font-medium text-brand-600 hover:text-brand-500 disabled:opacity-40';
</script>

<AdminPage
	title="Testimonials"
	description="Moderate student testimonials: pending ones are listed first."
>
	{#snippet actions()}
		<a href="/admin/content/testimonials/new" class="btn-primary btn-sm">New Testimonial</a>
	{/snippet}

	<Form form={data.forms.row} action="?/publish">
		{#snippet children({ submitting })}
			<DataTable {columns} rows={data.testimonials} empty="No testimonials yet.">
				{#snippet row(testimonial)}
					<tr class="hover:bg-gray-50">
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="flex items-center gap-1">
								{#if testimonial.is_published}
									<button
										type="submit"
										name="id"
										value={testimonial.id}
										formaction="?/moveUp"
										class="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
										aria-label="Move {testimonial.author_name} up"
										disabled={submitting || !canMove(testimonial, -1)}>↑</button
									>
									<button
										type="submit"
										name="id"
										value={testimonial.id}
										formaction="?/moveDown"
										class="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
										aria-label="Move {testimonial.author_name} down"
										disabled={submitting || !canMove(testimonial, 1)}>↓</button
									>
								{/if}
								<span class="ml-1 text-sm text-gray-500">{testimonial.order_index}</span>
							</div>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="text-sm font-medium text-gray-900">{testimonial.author_name}</div>
							{#if testimonial.author_title}
								<div class="text-xs text-gray-500">{testimonial.author_title}</div>
							{/if}
							{#if testimonial.member}
								<a
									href="/admin/users/{testimonial.member.id}"
									class="text-xs text-brand-600 hover:text-brand-500"
									>Member: {testimonial.member.email}</a
								>
							{/if}
						</td>
						<td class="px-6 py-4">
							<p class="line-clamp-2 max-w-xs text-sm text-gray-600">{testimonial.content}</p>
						</td>
						<td class="px-6 py-4 text-sm whitespace-nowrap text-amber-500">
							<span aria-label="{testimonial.rating ?? 0} out of 5"
								>{'★'.repeat(testimonial.rating ?? 0)}</span
							>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="flex gap-1">
								{#if testimonial.is_published}
									<Badge variant="success" size="sm">Published</Badge>
								{:else}
									<Badge variant="secondary" size="sm">Pending</Badge>
								{/if}
								{#if testimonial.is_featured}
									<Badge variant="warning" size="sm">Featured</Badge>
								{/if}
							</div>
						</td>
						<td class="px-6 py-4 text-right whitespace-nowrap">
							<div class="flex justify-end gap-3">
								<button
									type="submit"
									name="id"
									value={testimonial.id}
									formaction={testimonial.is_published ? '?/unpublish' : '?/publish'}
									class={linkButton}
									disabled={submitting}>{testimonial.is_published ? 'Unpublish' : 'Publish'}</button
								>
								<button
									type="submit"
									name="id"
									value={testimonial.id}
									formaction={testimonial.is_featured ? '?/unfeature' : '?/feature'}
									class={linkButton}
									disabled={submitting}>{testimonial.is_featured ? 'Unfeature' : 'Feature'}</button
								>
								<a
									href="/admin/content/testimonials/{testimonial.id}"
									class="text-sm font-medium text-brand-600 hover:text-brand-500">Edit</a
								>
							</div>
						</td>
					</tr>
				{/snippet}
			</DataTable>
		{/snippet}
	</Form>
</AdminPage>
