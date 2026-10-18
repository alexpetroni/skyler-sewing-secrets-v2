<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import { formatDateTime } from '#lib/components/admin/format.ts';
	import { formatDuration, mediaStatusBadge } from '#lib/components/admin/media-status.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const asset = $derived(data.asset);
</script>

<AdminPage title={asset.title ?? 'Untitled video'} description="Bunny video {asset.video_id}">
	{#snippet actions()}
		<a href="/admin/media" class="btn-ghost btn-sm">All videos</a>
	{/snippet}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<Card class="lg:col-span-2">
			{#if asset.thumbnail_url}
				<img
					src={asset.thumbnail_url}
					alt=""
					class="aspect-video w-full rounded-lg bg-gray-100 object-cover"
				/>
			{:else}
				<div
					class="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500"
				>
					No thumbnail yet
				</div>
			{/if}
			<dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
				<div>
					<dt class="text-gray-500">Status</dt>
					<dd class="mt-1">
						<Badge size="sm" variant={mediaStatusBadge[asset.status].variant}>
							{mediaStatusBadge[asset.status].label}
						</Badge>
					</dd>
				</div>
				<div>
					<dt class="text-gray-500">Duration</dt>
					<dd class="mt-1 text-gray-900">{formatDuration(asset.duration_seconds)}</dd>
				</div>
				<div>
					<dt class="text-gray-500">Size</dt>
					<dd class="mt-1 text-gray-900">
						{asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'}
					</dd>
				</div>
				<div>
					<dt class="text-gray-500">Updated</dt>
					<dd class="mt-1 text-gray-900">{formatDateTime(asset.updated_at)}</dd>
				</div>
			</dl>
			<p class="mt-4 text-sm">
				{#if asset.linkedLessonId}
					Used by
					<a
						href="/admin/content/lessons/{asset.linkedLessonId}"
						class="text-brand-600 hover:text-brand-500">this lesson</a
					>.
				{:else}
					<span class="text-gray-500">Not attached to a lesson.</span>
				{/if}
			</p>
		</Card>

		<div class="space-y-6">
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-gray-900">Thumbnail</h2>
				<Form form={data.forms.thumbnail} action="?/thumbnail" class="space-y-3">
					{#snippet children({ errors, submitting })}
						<Input
							label="Frame at (seconds)"
							name="seconds"
							type="number"
							min="0"
							value="0"
							error={errors.seconds?.[0]}
						/>
						<Button type="submit" size="sm" variant="secondary" loading={submitting}>
							Set thumbnail
						</Button>
					{/snippet}
				</Form>
			</Card>

			<Card>
				<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete video</h2>
				<ConfirmForm
					form={data.forms.remove}
					action="?/delete"
					phrase={DELETE_PHRASE}
					label="Delete video"
					description="Deletes the video from Bunny Stream too. A video used by a lesson cannot be deleted."
				/>
			</Card>
		</div>
	</div>
</AdminPage>
