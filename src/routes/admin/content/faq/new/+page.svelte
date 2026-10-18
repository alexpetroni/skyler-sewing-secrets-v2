<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import FaqFields from '#lib/components/admin/FaqFields.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="New FAQ" description="Add a question to the FAQ page.">
	{#snippet actions()}
		<a href="/admin/content/faq" class="btn-ghost btn-sm">All questions</a>
	{/snippet}

	<Form form={data.form} action="?/create" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<FaqFields orderIndex={data.nextOrderIndex} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/faq" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Create FAQ</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
