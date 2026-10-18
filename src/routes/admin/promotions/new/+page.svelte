<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import PromoFields from '#lib/components/admin/PromoFields.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { generatePromoCode } from '#lib/shared/schemas/commerce.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let code = $state('');
</script>

<AdminPage title="New Promotion" description="A discount code for every product or a chosen few.">
	{#snippet actions()}
		<a href="/admin/promotions" class="btn-ghost btn-sm">All promotions</a>
	{/snippet}

	<Form form={data.form} action="?/create" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<div class="mb-6 flex items-end gap-3">
					<div class="flex-1">
						<Input
							label="Code"
							name="code"
							placeholder="SAVE20"
							autocomplete="off"
							required
							bind:value={code}
							hint="2–32 letters, numbers, hyphens or underscores; stored upper-case"
							error={errors.code?.[0]}
						/>
					</div>
					<Button variant="secondary" onclick={() => (code = generatePromoCode())}>Generate</Button>
				</div>
				<PromoFields products={data.products} {errors} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/promotions" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Create Code</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
