<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import LessonFields from '#lib/components/admin/LessonFields.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const standalone = $derived(data.lesson.module_id === null);
</script>

<AdminPage title="Edit Lesson" description={data.lesson.title}>
	{#snippet actions()}
		{#if standalone}
			<a
				href="/admin/catalogue/new?kind=single&lesson={data.lesson.id}"
				class="btn-secondary btn-sm">Sell this video</a
			>
		{:else}
			<a href="/admin/content/modules/{data.lesson.module_id}" class="btn-ghost btn-sm">Module</a>
		{/if}
		<a href="/admin/content/lessons" class="btn-ghost btn-sm">All lessons</a>
	{/snippet}

	<Form form={data.forms.update} action="?/update" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<LessonFields lesson={data.lesson} modules={data.modules} assets={data.assets} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/lessons" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Save Changes</Button>
				</div>
			</Card>
		{/snippet}
	</Form>

	<Card>
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Resources</h2>
		{#if data.resources.length > 0}
			<Form form={data.forms.removeResource} action="?/removeResource">
				{#snippet children({ submitting })}
					<ul class="mb-6 divide-y divide-gray-100">
						{#each data.resources as resource (resource.id)}
							<li class="flex items-center justify-between gap-4 py-3 text-sm">
								<div class="min-w-0">
									<p class="font-medium text-gray-900">{resource.title}</p>
									<a
										href={resource.file_url}
										target="_blank"
										rel="noopener noreferrer"
										class="block truncate text-brand-600 hover:text-brand-500"
										>{resource.file_url}</a
									>
								</div>
								<button
									type="submit"
									name="resourceId"
									value={resource.id}
									class="text-sm font-medium text-red-600 hover:text-red-700"
									disabled={submitting}>Remove</button
								>
							</li>
						{/each}
					</ul>
				{/snippet}
			</Form>
		{:else}
			<p class="mb-6 text-sm text-gray-500">No resources yet.</p>
		{/if}

		<Form form={data.forms.addResource} action="?/addResource" class="space-y-4">
			{#snippet children({ errors, submitting })}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input label="Title" name="title" error={errors.title?.[0]} />
					<Input
						label="File URL"
						name="fileUrl"
						type="url"
						placeholder="https://"
						error={errors.fileUrl?.[0]}
					/>
				</div>
				<Button type="submit" size="sm" variant="secondary" loading={submitting}>
					Add resource
				</Button>
			{/snippet}
		</Form>
	</Card>

	<Card>
		<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete Lesson</h2>
		<ConfirmForm
			form={data.forms.remove}
			action="?/delete"
			phrase={DELETE_PHRASE}
			label="Delete Lesson"
			description="Learner progress and resources go with it. A lesson that is part of a product cannot be deleted."
		/>
	</Card>
</AdminPage>
