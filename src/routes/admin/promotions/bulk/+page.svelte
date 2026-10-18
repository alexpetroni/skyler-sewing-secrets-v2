<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import PromoFields from '#lib/components/admin/PromoFields.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { BULK_COUNT_MAX } from '#lib/shared/schemas/commerce.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const generated = $derived(form && 'generated' in form ? form.generated : null);
</script>

<AdminPage
	title="Bulk Generate"
	description="Single-use codes for giveaways: each one works once, for one customer."
>
	{#snippet actions()}
		<a href="/admin/promotions" class="btn-ghost btn-sm">All promotions</a>
	{/snippet}

	{#if generated}
		<Card>
			<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-lg font-semibold text-gray-900">
					{generated.codes.length} codes generated
				</h2>
				<a
					href="data:text/csv;charset=utf-8,{encodeURIComponent(generated.csv)}"
					download="{generated.prefix.toLowerCase()}-codes.csv"
					class="btn-secondary btn-sm">Download CSV</a
				>
			</div>
			<ul class="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4" data-testid="codes">
				{#each generated.codes as code (code)}
					<li class="rounded bg-gray-100 px-2 py-1">{code}</li>
				{/each}
			</ul>
		</Card>
	{/if}

	<Form form={data.form} action="?/generate" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<div class="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
					<Input
						label="Prefix"
						name="prefix"
						placeholder="GIFT"
						required
						hint="Codes look like GIFT-7KQ2MX"
						error={errors.prefix?.[0]}
					/>
					<Input
						label="How many"
						name="count"
						type="number"
						min="1"
						max={String(BULK_COUNT_MAX)}
						value="10"
						required
						hint="At most {BULK_COUNT_MAX}"
						error={errors.count?.[0]}
					/>
				</div>
				<PromoFields products={data.products} {errors} showLimits={false} />
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/promotions" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Generate Codes</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
