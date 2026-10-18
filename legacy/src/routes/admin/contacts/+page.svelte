<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { Card, Badge, Modal, Button } from '$lib/components/ui';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let selectedContact = $state<typeof data.contacts[0] | null>(null);

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Contact Submissions - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">Contact Submissions</h1>
		<p class="mt-1 text-sm text-gray-500">View messages from the contact form.</p>
	</div>

	<Card>
		{#snippet children()}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.contacts as contact}
							<tr class="hover:bg-gray-50 {contact.is_read ? '' : 'bg-blue-50'}">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDate(contact.created_at)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium text-gray-900">{contact.name}</div>
									<div class="text-sm text-gray-500">{contact.email}</div>
								</td>
								<td class="px-6 py-4 text-sm text-gray-500">
									{contact.subject || '(No subject)'}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if contact.is_read}
										<Badge variant="secondary">
											{#snippet children()}Read{/snippet}
										</Badge>
									{:else}
										<Badge variant="primary">
											{#snippet children()}New{/snippet}
										</Badge>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<button
										type="button"
										class="text-brand-600 hover:text-brand-900"
										onclick={() => selectedContact = contact}
									>
										View
									</button>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-6 py-12 text-center text-sm text-gray-500">
									No contact submissions yet.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>

<!-- View Contact Modal -->
{#if selectedContact}
	<Modal open={!!selectedContact} onclose={() => selectedContact = null}>
		{#snippet children()}
			{@const contact = selectedContact!}
			<div class="p-6">
				<div class="flex items-start justify-between mb-4">
					<div>
						<h3 class="text-lg font-semibold text-gray-900">{contact.subject || '(No subject)'}</h3>
						<p class="text-sm text-gray-500 mt-1">
							From: {contact.name} &lt;{contact.email}&gt;
						</p>
						<p class="text-xs text-gray-400 mt-1">
							{formatDate(contact.created_at)}
						</p>
					</div>
					{#if !contact.is_read}
						<form method="POST" action="?/markRead" use:enhance>
							<input type="hidden" name="id" value={contact.id}>
							<Button type="submit" size="sm" variant="secondary">
								{#snippet children()}Mark as Read{/snippet}
							</Button>
						</form>
					{/if}
				</div>
				<div class="mt-4 p-4 bg-gray-50 rounded-lg">
					<p class="text-sm text-gray-700 whitespace-pre-wrap">{contact.message}</p>
				</div>
				<div class="mt-6 flex justify-between">
					<a
						href="mailto:{contact.email}?subject=Re: {contact.subject || 'Your message'}"
						class="text-sm text-brand-600 hover:text-brand-500"
					>
						Reply via email
					</a>
					<Button variant="secondary" onclick={() => selectedContact = null}>
						{#snippet children()}Close{/snippet}
					</Button>
				</div>
			</div>
		{/snippet}
	</Modal>
{/if}
