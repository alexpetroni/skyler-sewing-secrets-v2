<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import DataTable from '#lib/components/admin/DataTable.svelte';
	import { formatDateTime } from '#lib/components/admin/format.ts';
	import type { DataTableColumn } from '#lib/components/admin/types.ts';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type AuditRow = (typeof data.entries.rows)[number];

	const columns: DataTableColumn<AuditRow>[] = [
		{ key: 'when', label: 'When', sortValue: (row) => row.createdAt },
		{ key: 'actor', label: 'Actor', sortValue: (row) => row.actor?.email ?? null },
		{ key: 'action', label: 'Action', sortValue: (row) => row.action },
		{ key: 'entity', label: 'Entity' },
		{ key: 'change', label: 'Change' }
	];

	function pageHref(page: number): string {
		const { entity = '', entityId = '', actorId = '' } = data.filters;
		const params = Object.entries({ entity, entityId, actorId, page: String(page) }).filter(
			([, value]) => value
		);
		return `/admin/audit?${new URLSearchParams(params)}`;
	}

	function summary(value: unknown): string {
		return value === null || value === undefined ? '' : JSON.stringify(value);
	}
</script>

<AdminPage title="Audit log" description="Every change made from the admin panel.">
	<Card padding="sm">
		<form method="GET" class="flex flex-col gap-4 sm:flex-row">
			<div class="flex-1">
				<Input
					name="entity"
					placeholder="Entity (profile, order, …)"
					value={data.filters.entity ?? ''}
				/>
			</div>
			<div class="flex-1">
				<Input name="entityId" placeholder="Entity id" value={data.filters.entityId ?? ''} />
			</div>
			<div class="flex-1">
				<Input name="actorId" placeholder="Actor id" value={data.filters.actorId ?? ''} />
			</div>
			<Button type="submit" variant="secondary">Filter</Button>
		</form>
	</Card>

	<DataTable
		{columns}
		rows={data.entries.rows}
		empty="No entries."
		pagination={{ ...data.entries, href: pageHref }}
	>
		{#snippet row(entry)}
			<tr class="align-top hover:bg-gray-50">
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
					{formatDateTime(entry.createdAt)}
				</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
					{entry.actor?.email ?? 'system'}
				</td>
				<td class="px-6 py-4 font-mono text-sm whitespace-nowrap text-gray-900">{entry.action}</td>
				<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
					<a
						href="/admin/audit?entity={entry.entity}&entityId={entry.entityId ?? ''}"
						class="hover:text-brand-600"
					>
						{entry.entity}
						{entry.entityId ?? ''}
					</a>
				</td>
				<td class="max-w-md px-6 py-4 font-mono text-xs break-all text-gray-500">
					{#if entry.before}<p>− {summary(entry.before)}</p>{/if}
					{#if entry.after}<p>+ {summary(entry.after)}</p>{/if}
				</td>
			</tr>
		{/snippet}
	</DataTable>
</AdminPage>
