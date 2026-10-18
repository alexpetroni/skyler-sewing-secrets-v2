<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import ModuleFields from '#lib/components/admin/ModuleFields.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="Edit Module" description={data.module.title}>
	{#snippet actions()}
		<a href="/admin/content/modules" class="btn-ghost btn-sm">All modules</a>
	{/snippet}

	<Form form={data.forms.update} action="?/update" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<ModuleFields module={data.module} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/modules" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Save Changes</Button>
				</div>
			</Card>
		{/snippet}
	</Form>

	<Card>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-gray-900">Lessons in this Module</h2>
			<a href="/admin/content/lessons/new?module={data.module.id}" class="btn-primary btn-sm"
				>Add Lesson</a
			>
		</div>
		{#if data.lessons.length > 0}
			<ul class="divide-y divide-gray-100">
				{#each data.lessons as lesson, index (lesson.id)}
					<li class="flex items-center justify-between py-3">
						<div class="flex items-center gap-3">
							<span class="w-6 text-sm text-gray-400">{index + 1}.</span>
							<div>
								<p class="text-sm font-medium text-gray-900">{lesson.title}</p>
								<div class="mt-1 flex gap-2">
									{#if lesson.is_published}
										<Badge variant="success" size="sm">Published</Badge>
									{:else}
										<Badge variant="secondary" size="sm">Draft</Badge>
									{/if}
									{#if lesson.is_free_preview}
										<Badge variant="primary" size="sm">Free Preview</Badge>
									{/if}
								</div>
							</div>
						</div>
						<a
							href="/admin/content/lessons/{lesson.id}"
							class="text-sm text-brand-600 hover:text-brand-500">Edit</a
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="py-4 text-center text-sm text-gray-500">No lessons in this module yet.</p>
		{/if}
	</Card>

	<Card>
		<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete Module</h2>
		<ConfirmForm
			form={data.forms.remove}
			action="?/delete"
			phrase={DELETE_PHRASE}
			label="Delete Module"
			description="This also deletes every lesson in this module. A module whose lessons are sold in a product cannot be deleted."
		/>
	</Card>
</AdminPage>
