<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { Card, Button, Badge, Input, Modal, Alert } from '$lib/components/ui';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let searchQuery = $state('');
	let filterType = $state<'all' | 'members' | 'admins' | 'suspended'>('all');
	let selectedUser = $state<typeof data.users[0] | null>(null);
	let showSuspendModal = $state(false);
	let showResetPasswordModal = $state(false);
	let actionLoading = $state(false);
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	const filteredUsers = $derived(() => {
		let users = data.users;

		// Filter by search query
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			users = users.filter(u => 
				u.email.toLowerCase().includes(query) ||
				(u.full_name?.toLowerCase() || '').includes(query)
			);
		}

		// Filter by type
		switch (filterType) {
			case 'members':
				users = users.filter(u => u.is_member);
				break;
			case 'admins':
				users = users.filter(u => u.is_admin);
				break;
			case 'suspended':
				users = users.filter(u => u.is_suspended);
				break;
		}

		return users;
	});

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'N/A';
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function openSuspendModal(user: typeof data.users[0]) {
		selectedUser = user;
		showSuspendModal = true;
	}

	function openResetPasswordModal(user: typeof data.users[0]) {
		selectedUser = user;
		showResetPasswordModal = true;
	}

	function closeModals() {
		showSuspendModal = false;
		showResetPasswordModal = false;
		selectedUser = null;
	}
</script>

<svelte:head>
	<title>Users - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Users</h1>
			<p class="mt-1 text-sm text-gray-500">Manage members and user accounts.</p>
		</div>
	</div>

	{#if actionMessage}
		<Alert variant={actionMessage.type}>
			{#snippet children()}
				{actionMessage!.text}
			{/snippet}
		</Alert>
	{/if}

	<!-- Filters -->
	<Card>
		{#snippet children()}
			<div class="p-4 flex flex-col sm:flex-row gap-4">
				<div class="flex-1">
					<Input
						type="search"
						placeholder="Search by name or email..."
						bind:value={searchQuery}
					/>
				</div>
				<div class="flex gap-2">
					<button
						type="button"
						class="px-3 py-2 text-sm font-medium rounded-lg transition-colors {filterType === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
						onclick={() => filterType = 'all'}
					>
						All ({data.users.length})
					</button>
					<button
						type="button"
						class="px-3 py-2 text-sm font-medium rounded-lg transition-colors {filterType === 'members' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
						onclick={() => filterType = 'members'}
					>
						Members ({data.users.filter(u => u.is_member).length})
					</button>
					<button
						type="button"
						class="px-3 py-2 text-sm font-medium rounded-lg transition-colors {filterType === 'admins' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
						onclick={() => filterType = 'admins'}
					>
						Admins ({data.users.filter(u => u.is_admin).length})
					</button>
					<button
						type="button"
						class="px-3 py-2 text-sm font-medium rounded-lg transition-colors {filterType === 'suspended' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
						onclick={() => filterType = 'suspended'}
					>
						Suspended ({data.users.filter(u => u.is_suspended).length})
					</button>
				</div>
			</div>
		{/snippet}
	</Card>

	<!-- Users Table -->
	<Card>
		{#snippet children()}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member Since</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredUsers() as user}
							<tr class="hover:bg-gray-50 {user.is_suspended ? 'opacity-60' : ''}">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<div class="h-10 w-10 flex-shrink-0">
											{#if user.avatar_url}
												<OptimizedImage
													class="h-10 w-10 rounded-full"
													src={user.avatar_url}
													alt=""
													width={40}
												/>
											{:else}
												<div class="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
													<span class="text-sm font-medium text-gray-600">
														{(user.full_name || user.email).charAt(0).toUpperCase()}
													</span>
												</div>
											{/if}
										</div>
										<div class="ml-4">
											<div class="text-sm font-medium text-gray-900">{user.full_name || 'No name'}</div>
											<div class="text-sm text-gray-500">{user.email}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex flex-wrap gap-1">
										{#if user.is_admin}
											<Badge variant="primary">
												{#snippet children()}Admin{/snippet}
											</Badge>
										{/if}
										{#if user.is_member}
											<Badge variant="success">
												{#snippet children()}Member{/snippet}
											</Badge>
										{/if}
										{#if user.is_suspended}
											<Badge variant="error">
												{#snippet children()}Suspended{/snippet}
											</Badge>
										{/if}
										{#if !user.is_member && !user.is_admin && !user.is_suspended}
											<Badge variant="secondary">
												{#snippet children()}Free{/snippet}
											</Badge>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDate(user.member_since)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDate(user.created_at)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<div class="flex justify-end gap-2">
										<button
											type="button"
											class="text-brand-600 hover:text-brand-900"
											onclick={() => openResetPasswordModal(user)}
										>
											Reset Password
										</button>
										{#if !user.is_admin}
											<button
												type="button"
												class="{user.is_suspended ? 'text-green-600 hover:text-green-900' : 'text-red-600 hover:text-red-900'}"
												onclick={() => openSuspendModal(user)}
											>
												{user.is_suspended ? 'Unsuspend' : 'Suspend'}
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-6 py-12 text-center text-sm text-gray-500">
									No users found.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>

<!-- Suspend Modal -->
{#if showSuspendModal && selectedUser}
	<Modal open={showSuspendModal} onclose={closeModals}>
		{#snippet children()}
			{@const user = selectedUser!}
			<div class="p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">
					{user.is_suspended ? 'Unsuspend User' : 'Suspend User'}
				</h3>
				<p class="text-sm text-gray-600 mb-6">
					{#if user.is_suspended}
						Are you sure you want to unsuspend <strong>{user.email}</strong>? They will regain access to their account.
					{:else}
						Are you sure you want to suspend <strong>{user.email}</strong>? They will lose access to their account immediately.
					{/if}
				</p>
				<form
					method="POST"
					action="?/toggleSuspend"
					use:enhance={() => {
						actionLoading = true;
						return async ({ result, update }) => {
							actionLoading = false;
							closeModals();
							if (result.type === 'success') {
								actionMessage = { type: 'success', text: `User ${selectedUser?.is_suspended ? 'unsuspended' : 'suspended'} successfully.` };
							} else {
								actionMessage = { type: 'error', text: 'Failed to update user status.' };
							}
							await update();
							setTimeout(() => actionMessage = null, 3000);
						};
					}}
				>
					<input type="hidden" name="userId" value={user.id}>
					<input type="hidden" name="suspend" value={user.is_suspended ? 'false' : 'true'}>
					{#if !user.is_suspended}<input type="text" name="reason" maxlength="500" placeholder="Reason (optional)" class="block w-full rounded-lg border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 mb-4">{/if}
					<div class="flex justify-end gap-3">
						<Button variant="secondary" onclick={closeModals}>
							{#snippet children()}Cancel{/snippet}
						</Button>
						<Button type="submit" variant={user.is_suspended ? 'primary' : 'danger'} disabled={actionLoading}>
							{#snippet children()}
								{actionLoading ? 'Processing...' : user.is_suspended ? 'Unsuspend' : 'Suspend'}
							{/snippet}
						</Button>
					</div>
				</form>
			</div>
		{/snippet}
	</Modal>
{/if}

<!-- Reset Password Modal -->
{#if showResetPasswordModal && selectedUser}
	<Modal open={showResetPasswordModal} onclose={closeModals}>
		{#snippet children()}
			{@const user = selectedUser!}
			<div class="p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Reset Password</h3>
				<p class="text-sm text-gray-600 mb-6">
					Send a password reset email to <strong>{user.email}</strong>?
				</p>
				<form
					method="POST"
					action="?/resetPassword"
					use:enhance={() => {
						actionLoading = true;
						return async ({ result, update }) => {
							actionLoading = false;
							closeModals();
							if (result.type === 'success') {
								actionMessage = { type: 'success', text: 'Password reset email sent successfully.' };
							} else {
								actionMessage = { type: 'error', text: 'Failed to send password reset email.' };
							}
							await update();
							setTimeout(() => actionMessage = null, 3000);
						};
					}}
				>
					<input type="hidden" name="email" value={user.email}>
					<div class="flex justify-end gap-3">
						<Button variant="secondary" onclick={closeModals}>
							{#snippet children()}Cancel{/snippet}
						</Button>
						<Button type="submit" disabled={actionLoading}>
							{#snippet children()}
								{actionLoading ? 'Sending...' : 'Send Reset Email'}
							{/snippet}
						</Button>
					</div>
				</form>
			</div>
		{/snippet}
	</Modal>
{/if}
