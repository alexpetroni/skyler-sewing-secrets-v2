<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import BlogPostFields from '#lib/components/admin/BlogPostFields.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="New Post" description="Write a blog post; it is saved as a draft.">
	{#snippet actions()}
		<a href="/admin/content/blog" class="btn-ghost btn-sm">All posts</a>
	{/snippet}

	<Form form={data.form} action="?/create" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<BlogPostFields {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/blog" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Create Post</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
