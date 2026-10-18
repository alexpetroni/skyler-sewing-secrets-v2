<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import FaqFields from '#lib/components/admin/FaqFields.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="Edit FAQ" description={data.faq.question}>
	{#snippet actions()}
		<a href="/admin/content/faq" class="btn-ghost btn-sm">All questions</a>
	{/snippet}

	<Form form={data.forms.update} action="?/update" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<FaqFields faq={data.faq} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/faq" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Save Changes</Button>
				</div>
			</Card>
		{/snippet}
	</Form>

	<Card>
		<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete FAQ</h2>
		<ConfirmForm
			form={data.forms.remove}
			action="?/delete"
			phrase={DELETE_PHRASE}
			label="Delete FAQ"
			description="This removes the question from the FAQ page. This action cannot be undone."
		/>
	</Card>
</AdminPage>
