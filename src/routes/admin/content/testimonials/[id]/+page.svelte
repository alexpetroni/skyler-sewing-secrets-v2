<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import TestimonialFields from '#lib/components/admin/TestimonialFields.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="Edit Testimonial" description={data.testimonial.author_name}>
	{#snippet actions()}
		<a href="/admin/content/testimonials" class="btn-ghost btn-sm">All testimonials</a>
	{/snippet}

	<Card>
		<div class="flex flex-wrap items-center gap-3 text-sm text-gray-600">
			{#if data.testimonial.is_published}
				<Badge variant="success">Published</Badge>
			{:else}
				<Badge variant="secondary">Pending</Badge>
			{/if}
			{#if data.testimonial.member}
				<span>
					Submitted by member
					<a
						href="/admin/users/{data.testimonial.member.id}"
						class="text-brand-600 hover:text-brand-500"
						>{data.testimonial.member.fullName || data.testimonial.member.email}</a
					>
					({data.testimonial.member.email})
				</span>
			{:else}
				<span>Added by an admin</span>
			{/if}
		</div>
	</Card>

	<Form form={data.forms.update} action="?/update" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<TestimonialFields testimonial={data.testimonial} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/testimonials" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Save Changes</Button>
				</div>
			</Card>
		{/snippet}
	</Form>

	<Card>
		<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete Testimonial</h2>
		<ConfirmForm
			form={data.forms.remove}
			action="?/delete"
			phrase={DELETE_PHRASE}
			label="Delete Testimonial"
			description="This removes the testimonial from the site. This action cannot be undone."
		/>
	</Card>
</AdminPage>
