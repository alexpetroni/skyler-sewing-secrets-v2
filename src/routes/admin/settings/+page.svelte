<script lang="ts">
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { MAINTENANCE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="Settings" description="Manage site-wide configuration.">
	<Card>
		<h2 class="text-lg font-semibold text-gray-900">Maintenance Mode</h2>
		<p class="mt-1 text-sm text-gray-500">
			When enabled, the whole site except the admin panel, sign-in and payment completion shows the
			maintenance page. Admins still see the normal site. Takes effect immediately.
		</p>
		<div class="mt-4">
			{#if data.maintenanceMode}
				<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
					<p class="text-sm text-red-700">
						The site is currently in maintenance mode. Visitors and members see the maintenance page
						everywhere except sign-in and payment completion; admins still see the normal site.
						Turning it off takes effect immediately.
					</p>
				</div>
				<Form form={data.forms.maintenanceOff} action="?/maintenanceOff">
					{#snippet children({ submitting })}
						<Button type="submit" size="sm" loading={submitting}>Turn maintenance mode off</Button>
					{/snippet}
				</Form>
			{:else}
				<ConfirmForm
					form={data.forms.maintenanceOn}
					action="?/maintenanceOn"
					phrase={MAINTENANCE_PHRASE}
					label="Turn maintenance mode on"
					description="Everyone but admins is shown the maintenance page until you turn it off."
				/>
			{/if}
		</div>
	</Card>

	<Card>
		<h2 class="text-lg font-semibold text-gray-900">Homepage Free Preview</h2>
		<p class="mt-1 text-sm text-gray-500">
			The lesson the homepage plays to every visitor. Only published lessons marked as a free
			preview can be shown; without a choice, the first free-preview lesson in the course is used.
		</p>
		<p class="mt-2 text-sm text-gray-700">
			Currently shown: <strong>{data.currentPreview?.title ?? 'none'}</strong>
		</p>
		<Form form={data.forms.preview} action="?/preview" class="mt-4" resetForm={false}>
			{#snippet children({ errors, submitting })}
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-64 flex-1">
						<Select
							label="Preview lesson"
							name="lessonId"
							value={data.previewLessonId}
							error={errors.lessonId?.[0]}
						>
							<option value="">First free-preview lesson (default)</option>
							{#each data.previewLessons as lesson (lesson.id)}
								<option value={lesson.id}>
									{lesson.moduleTitle
										? `${lesson.moduleTitle} — `
										: ''}{lesson.title}{lesson.isPublished ? '' : ' (draft)'}
								</option>
							{/each}
						</Select>
					</div>
					<Button type="submit" size="sm" loading={submitting}>Save</Button>
				</div>
			{/snippet}
		</Form>
	</Card>

	<Card>
		<h2 class="text-lg font-semibold text-gray-900">Contact Email</h2>
		<p class="mt-1 text-sm text-gray-500">
			Contact form messages are sent here. It is set in the deployment configuration (<code
				>CONTACT_EMAIL</code
			>).
		</p>
		<div class="mt-4 max-w-md">
			<Input label="Contact email" name="contactEmail" value={data.contactEmail} readonly />
		</div>
	</Card>
</AdminPage>
