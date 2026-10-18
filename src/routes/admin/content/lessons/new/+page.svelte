<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import LessonFields from '#lib/components/admin/LessonFields.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="New Lesson" description="A lesson in a module, or a standalone video.">
	{#snippet actions()}
		<a href="/admin/content/lessons" class="btn-ghost btn-sm">All lessons</a>
	{/snippet}

	<Form form={data.form} action="?/create" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<LessonFields
					moduleId={data.moduleId}
					modules={data.modules}
					assets={data.assets}
					{errors}
				/>
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/lessons" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Create Lesson</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
