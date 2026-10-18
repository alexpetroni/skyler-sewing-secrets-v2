<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import { formatDate } from '#lib/components/admin/format.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type UserRow = (typeof data.users.rows)[number];

	const columns: DataTableColumn<UserRow>[] = [
		{ key: 'user', label: 'User', sortValue: (row) => row.email },
		{ key: 'status', label: 'Status' },
		{ key: 'created', label: 'Created', sortValue: (row) => row.createdAt },
		{ key: 'actions', label: 'Actions', align: 'right' }
	];

	function pageHref(page: number): string {
		const params = Object.entries({ q: data.q, page: String(page) }).filter(([, value]) => value);
		return `/admin/users?${new URLSearchParams(params)}`;
	}
</script>

<AdminPage title="Users" description="Manage members and user accounts.">
	<Card padding="sm">
		<form method="GET" class="flex flex-col gap-4 sm:flex-row">
			<div class="flex-1">
				<Input type="search" name="q" placeholder="Search by name or email..." value={data.q} />
			</div>
			<Button type="submit" variant="secondary">Search</Button>
		</form>
	</Card>

	<DataTable
		{columns}
		rows={data.users.rows}
		empty="No users found."
		pagination={{ ...data.users, href: pageHref }}
	>
		{#snippet row(user)}
			<tr class="hover:bg-gray-50 {user.isSuspended ? 'opacity-60' : ''}">
				<td class="px-6 py-4 whitespace-nowrap">
					<div class="flex items-center gap-4">
						<Avatar src={user.avatarUrl} name={user.fullName || user.email} />
						<div>
							<div class="text-sm font-medium text-gray-900">{user.fullName || 'No name'}</div>
							<div class="text-sm text-gray-500">{user.email}</div>
						</div>
					</div>
				</td>
				<td class="px-6 py-4 whitespace-nowrap">
					<div class="flex flex-wrap gap-1">
						{#if user.isAdmin}<Badge variant="primary">Admin</Badge>{/if}
						{#if user.isMember}<Badge variant="success">Member</Badge>{/if}
						{#if user.isSuspended}<Badge variant="error">Suspended</Badge>{/if}
						{#if !user.isMember && !user.isAdmin && !user.isSuspended}
							<Badge variant="secondary">Free</Badge>
						{/if}
					</div>
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
					{formatDate(user.createdAt)}
				</td>
				<td class="px-6 py-4 text-right text-sm font-medium whitespace-nowrap">
					<a href="/admin/users/{user.id}" class="text-brand-600 hover:text-brand-900">View</a>
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
