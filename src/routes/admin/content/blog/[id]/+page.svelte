<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import BlogPostFields from '#lib/components/admin/BlogPostFields.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import { formatDate } from '#lib/components/admin/format.ts';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="Edit Post" description={data.post.title}>
	{#snippet actions()}
		{#if data.post.is_published}
			<a href="/blog/{data.post.slug}" target="_blank" class="btn-ghost btn-sm">View Post →</a>
		{/if}
		<a href="/admin/content/blog" class="btn-ghost btn-sm">All posts</a>
	{/snippet}

	<Card>
		<Form
			form={data.forms.publish}
			action={data.post.is_published ? '?/unpublish' : '?/publish'}
			class="flex flex-wrap items-center justify-between gap-4"
		>
			{#snippet children({ submitting })}
				<div class="flex items-center gap-3">
					{#if data.post.is_published}
						<Badge variant="success">Published</Badge>
					{:else}
						<Badge variant="secondary">Draft</Badge>
					{/if}
					<span class="text-sm text-gray-500">
						{data.post.published_at
							? `First published ${formatDate(data.post.published_at)}`
							: 'Not published yet'}
					</span>
				</div>
				<Button
					type="submit"
					size="sm"
					variant={data.post.is_published ? 'secondary' : 'primary'}
					loading={submitting}
				>
					{data.post.is_published ? 'Unpublish' : 'Publish'}
				</Button>
			{/snippet}
		</Form>
	</Card>

	<Form form={data.forms.update} action="?/update" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<BlogPostFields post={data.post} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/blog" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Save Changes</Button>
				</div>
			</Card>
		{/snippet}
	</Form>

	<Card>
		<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete Post</h2>
		<ConfirmForm
			form={data.forms.remove}
			action="?/delete"
			phrase={DELETE_PHRASE}
			label="Delete Post"
			description="This removes the post from the blog. This action cannot be undone."
		/>
	</Card>
</AdminPage>
