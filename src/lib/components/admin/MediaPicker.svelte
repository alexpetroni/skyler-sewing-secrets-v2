<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { untrack } from 'svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { mediaStatuses, type AdminMediaStatus } from '#lib/shared/schemas/admin.ts';
	import { formatDuration, mediaStatusBadge } from './media-status.ts';
	import type { PickerAsset } from './types.ts';

	interface Props {
		/** `media.list()`: every asset in the library. */
		assets: PickerAsset[];
		/** The hidden field carrying the chosen asset id ('' = none). */
		name?: string;
		/** The asset attached when the page loaded. */
		selectedId?: string | null;
		error?: string;
		/** Whether the drawer starts open. */
		open?: boolean;
	}

	let {
		assets,
		name = 'mediaAssetId',
		selectedId = null,
		error,
		open = $bindable(false)
	}: Props = $props();

	let chosen = $state<string | null>(untrack(() => selectedId));
	let search = $state('');
	let status = $state<AdminMediaStatus | ''>('');

	const selected = $derived(assets.find((asset) => asset.id === chosen) ?? null);
	const visible = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return assets.filter(
			(asset) =>
				(!status || asset.status === status) &&
				(!needle || (asset.title ?? '').toLowerCase().includes(needle))
		);
	});

	function choose(id: string | null) {
		chosen = id;
		open = false;
	}
</script>

<div>
	<span class="label">Video</span>
	<input type="hidden" {name} value={chosen ?? ''} />

	<div
		class="flex flex-wrap items-center gap-4 rounded-xl p-3 ring-1 {error
			? 'ring-red-300'
			: 'ring-charcoal-900/[0.08]'}"
	>
		{#if selected}
			{#if selected.thumbnail_url}
				<img
					src={selected.thumbnail_url}
					alt=""
					class="h-16 w-28 rounded-lg bg-gray-100 object-cover"
				/>
			{:else}
				<div class="h-16 w-28 rounded-lg bg-gray-100"></div>
			{/if}
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-gray-900">{selected.title ?? 'Untitled'}</p>
				<p class="mt-1 flex items-center gap-2 text-sm text-gray-500">
					<Badge size="sm" variant={mediaStatusBadge[selected.status].variant}>
						{mediaStatusBadge[selected.status].label}
					</Badge>
					{formatDuration(selected.duration_seconds)}
				</p>
			</div>
		{:else}
			<p class="flex-1 text-sm text-gray-500">No video attached.</p>
		{/if}
		<div class="flex gap-2">
			{#if selected}
				<Button size="sm" variant="ghost" onclick={() => choose(null)}>Remove</Button>
			{/if}
			<Button size="sm" variant="secondary" onclick={() => (open = true)}>Choose video</Button>
		</div>
	</div>
	{#if error}
		<p class="mt-2 text-[13px] text-red-700">{error}</p>
	{/if}
</div>

{#if open}
	<div class="fixed inset-0 z-50 flex justify-end bg-charcoal-900/30" role="presentation">
		<div
			class="flex h-full w-full max-w-lg flex-col bg-white shadow-lift"
			role="dialog"
			aria-modal="true"
			aria-label="Choose a video"
		>
			<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-semibold text-gray-900">Choose a video</h2>
				<Button size="sm" variant="ghost" onclick={() => (open = false)}>Close</Button>
			</div>
			<div class="space-y-3 border-b border-gray-200 px-6 py-4">
				<input
					type="search"
					class="input"
					placeholder="Search videos..."
					aria-label="Search videos"
					bind:value={search}
				/>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<select class="select w-auto" aria-label="Filter by status" bind:value={status}>
						<option value="">All statuses</option>
						{#each mediaStatuses as option (option)}
							<option value={option}>{mediaStatusBadge[option].label}</option>
						{/each}
					</select>
					<div class="flex gap-3 text-sm">
						<a href="/admin/media/import" class="text-brand-600 hover:text-brand-500"
							>Import from Bunny</a
						>
						<a href="/admin/media/upload" class="text-brand-600 hover:text-brand-500">Upload</a>
					</div>
				</div>
			</div>
			<ul class="flex-1 divide-y divide-gray-100 overflow-y-auto">
				{#each visible as asset (asset.id)}
					<li>
						<button
							type="button"
							class="flex w-full items-center gap-4 px-6 py-3 text-left hover:bg-gray-50 {asset.id ===
							chosen
								? 'bg-gray-50'
								: ''}"
							aria-pressed={asset.id === chosen}
							onclick={() => choose(asset.id)}
						>
							{#if asset.thumbnail_url}
								<img
									src={asset.thumbnail_url}
									alt=""
									class="h-12 w-20 rounded bg-gray-100 object-cover"
								/>
							{:else}
								<div class="h-12 w-20 rounded bg-gray-100"></div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-gray-900">
									{asset.title ?? 'Untitled'}
								</p>
								<p class="text-sm text-gray-500">{formatDuration(asset.duration_seconds)}</p>
							</div>
							<Badge size="sm" variant={mediaStatusBadge[asset.status].variant}>
								{mediaStatusBadge[asset.status].label}
							</Badge>
						</button>
					</li>
				{:else}
					<li class="px-6 py-12 text-center text-sm text-gray-500">No videos match.</li>
				{/each}
			</ul>
			<p class="border-t border-gray-200 px-6 py-3 text-[13px] text-gray-500">
				Only a video that is Ready can be published.
			</p>
		</div>
	</div>
{/if}
