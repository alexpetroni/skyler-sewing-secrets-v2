<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { untrack } from 'svelte';
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import ConfirmForm from '#lib/components/admin/ConfirmForm.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import LessonPicker from '#lib/components/admin/LessonPicker.svelte';
	import MarkdownEditor from '#lib/components/admin/MarkdownEditor.svelte';
	import { promoStatusBadge } from '#lib/components/admin/promo-status.ts';
	import PriceTag from '#lib/components/shop/PriceTag.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { formatPence, parsePounds, penceToPounds } from '#lib/shared/money.ts';
	import { effectivePrice } from '#lib/shared/pricing.ts';
	import { DELETE_PHRASE } from '#lib/shared/schemas/admin.ts';
	import { toUtcDateTimeLocal } from '#lib/shared/schemas/catalog.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const product = $derived(data.product);
	const isCourse = $derived(product.kind === 'course');

	// The pricing inputs drive the live preview of the catalogue card's price.
	let priceText = $state(untrack(() => penceToPounds(data.product.price)));
	let saleText = $state(untrack(() => penceToPounds(data.product.sale_price)));
	let saleStarts = $state(untrack(() => toUtcDateTimeLocal(data.product.sale_starts_at)));
	let saleEnds = $state(untrack(() => toUtcDateTimeLocal(data.product.sale_ends_at)));

	/** A `datetime-local` value as the UTC instant the server will store. */
	const utc = (value: string) => (value ? `${value}Z` : null);

	const preview = $derived.by(() => {
		const price = parsePounds(priceText);
		if (price === null) return null;
		const sale = saleText.trim() === '' ? null : parsePounds(saleText);
		return effectivePrice(
			{
				price,
				sale_price: sale,
				sale_starts_at: utc(saleStarts),
				sale_ends_at: utc(saleEnds)
			},
			new Date()
		);
	});

	/**
	 * The posted field is a JSON string, so superforms reports its errors as a
	 * plain list even though the parsed value is an array.
	 */
	function fieldError(errors: object, name: string): string | undefined {
		return (errors as Record<string, string[] | undefined>)[name]?.[0];
	}

	const kindLabel = { course: 'Course', bundle: 'Bundle', single: 'Single video' };
</script>

<AdminPage title="Edit Product" description={product.title}>
	{#snippet actions()}
		{#if product.is_published}
			<a href="/products/{product.slug}" class="btn-secondary btn-sm">View page</a>
		{/if}
		<a href="/admin/catalogue" class="btn-ghost btn-sm">All products</a>
	{/snippet}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div class="space-y-6 lg:col-span-2">
			<Card>
				<h2 class="mb-4 text-lg font-semibold text-gray-900">Basics</h2>
				<Form form={data.forms.basics} action="?/basics" resetForm={false} class="space-y-6">
					{#snippet children({ errors, submitting })}
						<p class="text-sm text-gray-600">
							Kind: <span class="font-medium text-gray-900">{kindLabel[product.kind]}</span>
							<span class="text-gray-500">(fixed after creation)</span>
						</p>
						<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
							<Input
								label="Title"
								name="title"
								value={product.title}
								required
								error={errors.title?.[0]}
							/>
							<Input
								label="Slug"
								name="slug"
								value={product.slug}
								required
								hint="Lowercase letters, numbers and hyphens"
								error={errors.slug?.[0]}
							/>
						</div>
						<Input
							label="Tagline"
							name="tagline"
							value={product.tagline ?? ''}
							error={errors.tagline?.[0]}
						/>
						<MarkdownEditor
							name="descriptionMd"
							label="Description"
							value={product.description_md ?? ''}
							html={product.description_html ?? ''}
							error={errors.descriptionMd?.[0]}
						/>
						<Input
							label="Cover image URL"
							name="coverImageUrl"
							type="url"
							placeholder="https://"
							value={product.cover_image_url ?? ''}
							error={errors.coverImageUrl?.[0]}
						/>
						<div class="flex justify-end border-t border-gray-200 pt-4">
							<Button type="submit" loading={submitting}>Save Basics</Button>
						</div>
					{/snippet}
				</Form>
			</Card>

			<Card>
				<h2 class="mb-4 text-lg font-semibold text-gray-900">Contents</h2>
				{#if isCourse}
					<LessonPicker lessons={[]} disabled />
				{:else}
					<Form form={data.forms.contents} action="?/contents" resetForm={false}>
						{#snippet children({ errors, submitting })}
							<LessonPicker
								lessons={data.lessons}
								productId={product.id}
								max={product.kind === 'single' ? 1 : undefined}
								error={fieldError(errors, 'lessonIds')}
							/>
							<div class="mt-6 flex justify-end border-t border-gray-200 pt-4">
								<Button type="submit" loading={submitting}>Save Contents</Button>
							</div>
						{/snippet}
					</Form>
				{/if}
			</Card>

			<Card>
				<h2 class="mb-4 text-lg font-semibold text-gray-900">Pricing</h2>
				<Form form={data.forms.pricing} action="?/pricing" resetForm={false} class="space-y-6">
					{#snippet children({ errors, submitting })}
						<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
							<Input
								label="Price (£)"
								name="price"
								inputmode="decimal"
								required
								bind:value={priceText}
								hint="At least £0.30"
								error={errors.price?.[0]}
							/>
							<Input
								label="Sale price (£)"
								name="salePrice"
								inputmode="decimal"
								bind:value={saleText}
								hint="Leave empty for no sale"
								error={errors.salePrice?.[0]}
							/>
							<Input
								label="Sale starts"
								name="saleStartsAt"
								type="datetime-local"
								bind:value={saleStarts}
								hint="UTC; empty starts now"
								error={errors.saleStartsAt?.[0]}
							/>
							<Input
								label="Sale ends"
								name="saleEndsAt"
								type="datetime-local"
								bind:value={saleEnds}
								hint="UTC; empty runs until removed"
								error={errors.saleEndsAt?.[0]}
							/>
						</div>
						<div class="rounded-xl bg-gray-50 p-4">
							<p class="mb-2 text-sm font-medium text-gray-700">The catalogue shows now</p>
							{#if preview}
								<PriceTag
									price={preview.price}
									listPrice={preview.listPrice}
									onSale={preview.onSale}
									saleEndsAt={preview.saleEndsAt}
								/>
							{:else}
								<p class="text-sm text-gray-500">Enter a price to preview it.</p>
							{/if}
						</div>
						<div class="flex justify-end border-t border-gray-200 pt-4">
							<Button type="submit" loading={submitting}>Save Pricing</Button>
						</div>
					{/snippet}
				</Form>
			</Card>

			<Card>
				<h2 class="mb-4 text-lg font-semibold text-gray-900">Visibility</h2>
				<Form
					form={data.forms.visibility}
					action="?/visibility"
					resetForm={false}
					class="space-y-6"
				>
					{#snippet children({ errors, submitting })}
						<div class="flex flex-wrap gap-6">
							{@render checkbox(
								'isPublished',
								'Published',
								'Listed in the catalogue and on sale',
								product.is_published
							)}
							{@render checkbox(
								'isFeatured',
								'Featured',
								'Shown first in the catalogue',
								product.is_featured
							)}
						</div>
						{#if data.checklist.length > 0}
							<div class="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
								<p class="font-medium">Before it can be published:</p>
								<ul class="mt-2 list-disc space-y-1 pl-5">
									{#each data.checklist as item (item)}
										<li>{item}</li>
									{/each}
								</ul>
							</div>
						{:else if !product.is_published}
							<p class="text-sm text-gray-500">Ready to publish.</p>
						{/if}
						<div class="sm:w-48">
							<Input
								label="Sort order"
								name="sortOrder"
								type="number"
								value={String(product.sort_order)}
								hint="Lower comes first"
								error={errors.sortOrder?.[0]}
							/>
						</div>
						<div class="flex justify-end border-t border-gray-200 pt-4">
							<Button type="submit" loading={submitting}>Save Visibility</Button>
						</div>
					{/snippet}
				</Form>
			</Card>

			{#if !isCourse}
				<Card>
					<h2 class="mb-2 text-lg font-semibold text-gray-900">Delete Product</h2>
					<ConfirmForm
						form={data.forms.remove}
						action="?/delete"
						phrase={DELETE_PHRASE}
						label="Delete Product"
						description="Only a product nobody has bought or been granted can be deleted; otherwise unpublish it."
					/>
				</Card>
			{/if}
		</div>

		<aside class="space-y-6">
			<Card>
				<h2 class="mb-3 text-base font-semibold text-gray-900">Where it is sold</h2>
				{#if data.promotions.length > 0}
					<ul class="divide-y divide-gray-100">
						{#each data.promotions as promotion (promotion.id)}
							<li class="flex items-center justify-between gap-3 py-2 text-sm">
								<a
									href="/admin/promotions/{promotion.id}"
									class="font-mono text-brand-600 hover:text-brand-500">{promotion.code}</a
								>
								<span class="text-gray-500">
									{promotion.discountType === 'percentage'
										? `${promotion.discountValue}%`
										: formatPence(promotion.discountValue)} off
								</span>
								<Badge size="sm" variant={promoStatusBadge[promotion.status].variant}>
									{promoStatusBadge[promotion.status].label}
								</Badge>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500">No promotion is scoped to this product.</p>
				{/if}
				<a href="/admin/promotions/new" class="mt-3 inline-block text-sm text-brand-600"
					>New promotion</a
				>
			</Card>

			{#if !isCourse}
				<Card>
					<h2 class="mb-3 text-base font-semibold text-gray-900">Its videos are also in</h2>
					{#if data.lessons.length > 0}
						<ul class="space-y-3 text-sm">
							{#each data.lessons as lesson (lesson.id)}
								{@const others = lesson.products.filter((other) => other.id !== product.id)}
								<li>
									<p class="font-medium text-gray-900">{lesson.title}</p>
									{#if others.length > 0}
										<p class="text-gray-500">
											{#each others as other, index (other.id)}
												{#if index > 0},
												{/if}<a
													href="/admin/catalogue/{other.id}"
													class="text-brand-600 hover:text-brand-500">{other.title}</a
												>
											{/each}
										</p>
									{:else}
										<p class="text-gray-500">Only this product.</p>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-gray-500">No videos yet.</p>
					{/if}
				</Card>
			{/if}
		</aside>
	</div>
</AdminPage>

{#snippet checkbox(name: string, label: string, description: string, checked: boolean)}
	<label for="product-{name}" class="flex items-start gap-2.5 text-sm">
		<input
			id="product-{name}"
			{name}
			type="checkbox"
			{checked}
			class="mt-0.5 h-4 w-4 rounded-md border-0 text-sage-600 ring-1 ring-charcoal-900/[0.12] ring-inset focus:ring-2 focus:ring-sage-500"
		/>
		<span>
			<span class="font-medium text-charcoal-900">{label}</span>
			<span class="block text-charcoal-500">{description}</span>
		</span>
	</label>
{/snippet}
