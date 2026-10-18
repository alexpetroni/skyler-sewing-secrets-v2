<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import TestimonialFields from '#lib/components/admin/TestimonialFields.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage
	title="New Testimonial"
	description="Add a testimonial; it is saved unpublished until you publish it from the list."
>
	{#snippet actions()}
		<a href="/admin/content/testimonials" class="btn-ghost btn-sm">All testimonials</a>
	{/snippet}

	<Form form={data.form} action="?/create" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<TestimonialFields {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/testimonials" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Create Testimonial</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
