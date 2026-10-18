<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import ModuleFields from '#lib/components/admin/ModuleFields.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AdminPage title="New Module" description="Add a module to the course.">
	{#snippet actions()}
		<a href="/admin/content/modules" class="btn-ghost btn-sm">All modules</a>
	{/snippet}

	<Form form={data.form} action="?/create" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<ModuleFields orderIndex={data.nextOrderIndex} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/content/modules" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Create Module</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
