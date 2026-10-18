<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- the reply link is mailto:, not an app route */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import { formatDateTime } from '#lib/components/admin/format.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type ContactRow = (typeof data.contacts)[number];

	const columns: DataTableColumn<ContactRow>[] = [
		{ key: 'date', label: 'Date', sortValue: (contact) => contact.created_at },
		{ key: 'from', label: 'From' },
		{ key: 'message', label: 'Message' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];

	function replyHref(contact: ContactRow): string {
		const subject = `Re: ${contact.subject || 'Your message'}`;
		return `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}`;
	}
</script>

<AdminPage title="Contact Submissions" description="View messages from the contact form.">
	<Form form={data.forms.read} action="?/markRead">
		{#snippet children({ submitting })}
			<DataTable {columns} rows={data.contacts} empty="No contact submissions yet.">
				{#snippet row(contact)}
					<tr class="align-top hover:bg-gray-50">
						<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
							{formatDateTime(contact.created_at)}
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="text-sm font-medium text-gray-900">{contact.name}</div>
							<div class="text-sm text-gray-500">{contact.email}</div>
						</td>
						<td class="px-6 py-4">
							<details>
								<summary class="cursor-pointer text-sm text-gray-900">
									{contact.subject || '(No subject)'}
								</summary>
								<p class="mt-2 max-w-xl text-sm whitespace-pre-wrap text-gray-700">
									{contact.message}
								</p>
							</details>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							{#if contact.is_read}
								<Badge variant="secondary" size="sm">Read</Badge>
							{:else}
								<Badge variant="primary" size="sm">New</Badge>
							{/if}
						</td>
						<td class="px-6 py-4 text-right whitespace-nowrap">
							<div class="flex justify-end gap-3">
								{#if !contact.is_read}
									<button
										type="submit"
										name="id"
										value={contact.id}
										class="text-sm font-medium text-brand-600 hover:text-brand-500 disabled:opacity-40"
										disabled={submitting}>Mark as read</button
									>
								{/if}
								<a
									href={replyHref(contact)}
									class="text-sm font-medium text-brand-600 hover:text-brand-500">Reply via email</a
								>
							</div>
						</td>
					</tr>
				{/snippet}
			</DataTable>
		{/snippet}
	</Form>
</AdminPage>
